import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';

async function listen(server) { server.listen(0,'127.0.0.1'); await once(server,'listening'); return server.address().port; }

test('gateway admission counts separate clients and retains uncertain tasks', {timeout:12000}, async t => {
  let agentSessions=0;
  const agent=http.createServer((req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.method==='POST'&&req.url==='/session'){agentSessions++;return res.end(JSON.stringify({id:'busy-task'}));}
    if(req.method==='POST'&&req.url==='/session/busy-task/prompt_async'){res.statusCode=204;return res.end();}
    if(req.url==='/session/status'){res.statusCode=500;return res.end('{}');}
    if(req.url==='/session/busy-task/message')return res.end('[]');
    res.statusCode=404;res.end('{}');
  });
  const agentPort=await listen(agent);
  const backend=http.createServer();const wss=new WebSocketServer({server:backend});
  let connectionNumber=0;
  wss.on('connection',socket=>{
    const number=++connectionNumber;let requests=0;
    socket.send(JSON.stringify({type:'session.created',session:{audio:{input:{format:{rate:16000}},output:{format:{rate:24000}}}}}));
    socket.on('message',raw=>{
      const event=JSON.parse(raw);
      if(event.type==='session.update')socket.send(JSON.stringify({type:'session.updated'}));
      if(event.type!=='response.create')return;
      const id=`r${number}-${++requests}`;
      socket.send(JSON.stringify({type:'response.created',response:{id}}));
      const output=requests===1?[{type:'function_call',name:'delegate_task',call_id:`c${number}`,arguments:JSON.stringify({task:`task ${number}`})}]:[];
      socket.send(JSON.stringify({type:'response.done',response:{id,status:'completed',output}}));
    });
  });
  const backendPort=await listen(backend);
  const reserve=http.createServer();const gatewayPort=await listen(reserve);await new Promise(resolve=>reserve.close(resolve));
  await mkdir('.cache',{recursive:true});const temp=await mkdtemp(path.resolve('.cache/admission-concurrency-'));
  const samplePath=path.join(temp,'sample.json');
  await writeFile(samplePath,JSON.stringify({observedAt:new Date().toISOString(),dedicatedBytes:20*1024**3,sharedBytes:0,availableRamBytes:10*1024**3}));
  const env={...process.env,ASSISTAI_GATEWAY_PORT:String(gatewayPort),ASSISTAI_DB_PATH:':memory:',ASSISTAI_LFM_REALTIME_URL:`ws://127.0.0.1:${backendPort}/v1/realtime`,ASSISTAI_OPENCODE_URL:`http://127.0.0.1:${agentPort}`,ASSISTAI_BUDGET_SAMPLE_PATH:samplePath,ASSISTAI_BUDGET_BASELINE_SHARED_BYTES:'0',ASSISTAI_TASK_VRAM_ESTIMATE_BYTES:String(1.5*1024**3),ASSISTAI_TASK_RAM_ESTIMATE_BYTES:String(0.25*1024**3)};
  delete env.ASSISTAI_LFM_TRANSCRIPT_ASR_URL;
  const child=spawn(process.execPath,['prototype/gateway.mjs'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk});
  const clients=[];
  t.after(async()=>{child.kill();for(const c of clients)c.terminate();for(const c of wss.clients)c.terminate();await Promise.all([new Promise(resolve=>wss.close(resolve)),new Promise(resolve=>backend.close(resolve)),new Promise(resolve=>agent.close(resolve))]);});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(`Gateway startup timeout: ${stderr}`)),5000);
    child.once('exit',code=>{clearTimeout(timer);reject(Error(`Gateway exited ${code}: ${stderr}`));});
    child.stdout.on('data',chunk=>{if(chunk.toString().includes('Experimental voice gateway')){clearTimeout(timer);resolve();}});
  });
  async function request(expected) {
    const ws=new WebSocket(`ws://127.0.0.1:${gatewayPort}/voice`);clients.push(ws);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error(`Waiting for ${expected}`)),4000);
      ws.on('error',reject);
      ws.on('message',(data,binary)=>{
        if(binary)return;const event=JSON.parse(data);
        if(event.type==='asr.ready'){ws.send(JSON.stringify({type:'audio.start'}));ws.send(Buffer.alloc(3200));ws.send(JSON.stringify({type:'audio.end'}));}
        else if(event.type===expected){clearTimeout(timer);resolve(event);}
        else if(event.type==='error'){clearTimeout(timer);reject(Error(JSON.stringify(event)));}
      });
    });
  }
  await request('task.started');
  const uncertain=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Expected agent status failure')),5000);
    clients[0].on('message',(data,binary)=>{if(!binary&&JSON.parse(data).type==='task.error'){clearTimeout(timer);resolve();}});
  });
  const rejected=await request('task.rejected');
  assert.match(rejected.message,/budget/);
  await uncertain;
  const afterError=await request('task.rejected');
  assert.match(afterError.message,/budget/);
  assert.equal(agentSessions,1);
});
