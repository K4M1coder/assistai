import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }

test('parallel native tool calls respect shared admission and resume after both results', {timeout:10000}, async t => {
  let sessions = 0, prompts = 0, continuations = 0; const outputs = [];
  const agent = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/session') { sessions++; return res.end(JSON.stringify({id:`task-${sessions}`})); }
    if (req.method === 'POST' && /\/prompt_async$/.test(req.url)) { prompts++; res.statusCode=204; return res.end(); }
    if (req.url === '/session/status') return res.end(JSON.stringify({'task-1':{type:'busy'}}));
    if (/\/message$/.test(req.url)) return res.end('[]');
    res.statusCode=404; return res.end('{}');
  });
  const agentPort=await listen(agent);
  const backend=http.createServer(); const wss=new WebSocketServer({server:backend});
  wss.on('connection',socket=>{
    let requests=0;
    socket.send(JSON.stringify({type:'session.created',session:{audio:{input:{format:{rate:16000}},output:{format:{rate:24000}}}}}));
    socket.on('message',raw=>{
      const event=JSON.parse(raw);
      if(event.type==='session.update') return socket.send(JSON.stringify({type:'session.updated'}));
      if(event.type==='conversation.item.create'&&event.item?.type==='function_call_output') outputs.push(event.item);
      if(event.type!=='response.create')return;
      const id=`r${++requests}`;socket.send(JSON.stringify({type:'response.created',response:{id}}));
      if(requests===1){
        const output=['one','two'].map((value,i)=>({type:'function_call',name:'delegate_task',call_id:`c${i}`,arguments:JSON.stringify({task:`Task ${value}`})}));
        return socket.send(JSON.stringify({type:'response.done',response:{id,status:'completed',output}}));
      }
      continuations++;socket.send(JSON.stringify({type:'response.done',response:{id,status:'completed',output:[]}}));
    });
  });
  const backendPort=await listen(backend);const reserve=http.createServer();const port=await listen(reserve);await new Promise(r=>reserve.close(r));
  await mkdir('.cache',{recursive:true});const temp=await mkdtemp(path.resolve('.cache/native-parallel-'));
  const sample=path.join(temp,'budget.json');await writeFile(sample,JSON.stringify({observedAt:new Date().toISOString(),dedicatedBytes:20*1024**3,sharedBytes:0,availableRamBytes:10*1024**3}));
  const env={...process.env,ASSISTAI_GATEWAY_PORT:String(port),ASSISTAI_DB_PATH:':memory:',ASSISTAI_LFM_REALTIME_URL:`ws://127.0.0.1:${backendPort}/v1/realtime`,ASSISTAI_LFM_TRANSCRIPT_ASR_URL:'',ASSISTAI_OPENCODE_URL:`http://127.0.0.1:${agentPort}`,ASSISTAI_BUDGET_SAMPLE_PATH:sample,ASSISTAI_SHARED_RESERVATIONS_PATH:path.join(temp,'ledger.sqlite'),ASSISTAI_BUDGET_BASELINE_SHARED_BYTES:'0',ASSISTAI_TASK_VRAM_ESTIMATE_BYTES:String(1.5*1024**3),ASSISTAI_TASK_RAM_ESTIMATE_BYTES:String(0.25*1024**3)};
  const child=spawn(process.execPath,['prototype/gateway.mjs'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe'],windowsHide:true});let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  let client;t.after(async()=>{client?.terminate();child.kill();for(const c of wss.clients)c.terminate();await Promise.all([new Promise(r=>wss.close(r)),new Promise(r=>backend.close(r)),new Promise(r=>agent.close(r))]);});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Startup timeout: ${stderr}`)),4000);child.once('exit',code=>{clearTimeout(timer);reject(Error(`Gateway exited ${code}: ${stderr}`))});child.stdout.on('data',b=>{if(b.toString().includes('Experimental voice gateway')){clearTimeout(timer);resolve()}})});
  client=new WebSocket(`ws://127.0.0.1:${port}/voice`);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Parallel task test timed out')),5000);client.on('error',reject);
    client.on('message',(data,binary)=>{if(binary)return;const event=JSON.parse(data);
      if(event.type==='asr.ready'){client.send(JSON.stringify({type:'audio.start'}));client.send(Buffer.alloc(2));client.send(JSON.stringify({type:'audio.end'}));}
      else if(event.type==='speech.end'){clearTimeout(timer);resolve();}
      else if(event.type==='error'){clearTimeout(timer);reject(Error(event.message));}
    });
  });
  assert.equal(sessions,1);assert.equal(prompts,1);assert.equal(continuations,1);
  assert.deepEqual(outputs.map(item=>item.call_id),['c0','c1']);
  assert.deepEqual(outputs.map(item=>JSON.parse(item.output).accepted),[true,false]);
});
