import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
async function fetchJson(req) { const parts=[];for await(const b of req)parts.push(b);return JSON.parse(Buffer.concat(parts).toString()||'{}'); }

test('opt-in gateway delegates a task and speaks its completion notification', {timeout:20000}, async t => {
  const calls=[]; let requestNumber=0; let notificationPrompt='';
  const agent=http.createServer(async(req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.method==='POST' && req.url==='/session')return res.end(JSON.stringify({id:'fixture-session'}));
    if(req.method==='POST' && req.url==='/session/fixture-session/prompt_async'){const body=await fetchJson(req);calls.push(body.parts[0].text);res.statusCode=204;return res.end();}
    if(req.url==='/session/status')return res.end('{}');
    if(req.url==='/session/fixture-session/message')return res.end(JSON.stringify([{info:{role:'assistant',time:{completed:1}},parts:[{type:'text',text:'BLUEBIRD'}]}]));
    res.statusCode=404;res.end('{}');
  });
  const agentPort=await listen(agent);
  const backend=http.createServer();const wss=new WebSocketServer({server:backend});
  wss.on('connection',socket=>{
    socket.send(JSON.stringify({type:'session.created',session:{audio:{input:{format:{rate:16000}},output:{format:{rate:24000}}}}}));
    socket.on('message',raw=>{
      const e=JSON.parse(raw);
      if(e.type==='session.update')socket.send(JSON.stringify({type:'session.updated'}));
      if(e.type==='conversation.item.create' && e.item?.role==='user') notificationPrompt=e.item.content[0].text;
      if(e.type!=='response.create')return;
      requestNumber++;const id=`r${requestNumber}`;
      socket.send(JSON.stringify({type:'response.created',response:{id}}));
      if(requestNumber===1){socket.send(JSON.stringify({type:'response.done',response:{id,status:'completed',output:[{type:'function_call',name:'delegate_task',call_id:'call1',arguments:JSON.stringify({task:'Read fixture.txt and report the secret word'})}]}}));return;}
      if(requestNumber===3)assert.equal(e.response.tool_choice,'none');
      socket.send(JSON.stringify({type:'response.output_text.delta',response_id:id,delta:requestNumber===2?'Task started.':'Task finished.'}));
      socket.send(JSON.stringify({type:'response.output_audio.delta',response_id:id,delta:Buffer.from([1,0,2,0]).toString('base64')}));
      socket.send(JSON.stringify({type:'response.done',response:{id,status:'completed',output:[]}}));
    });
  });
  const backendPort=await listen(backend);
  const reservation=http.createServer();const gatewayPort=await listen(reservation);await new Promise(resolve=>reservation.close(resolve));
  const root=process.cwd();const cache=path.resolve(root,'.cache');await mkdir(cache,{recursive:true});const temp=await mkdtemp(path.join(cache,'lfm-gateway-integration-'));
  const env={...process.env,ASSISTAI_GATEWAY_PORT:String(gatewayPort),ASSISTAI_LFM_REALTIME_URL:`ws://127.0.0.1:${backendPort}/v1/realtime`,ASSISTAI_OPENCODE_URL:`http://127.0.0.1:${agentPort}`,ASSISTAI_DB_PATH:path.join(temp,'events.sqlite')};
  const child=spawn(process.execPath,['prototype/gateway.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stderr='';child.stderr.on('data',x=>{stderr+=x});
  t.after(async()=>{child.kill();for(const c of wss.clients)c.terminate();await Promise.all([new Promise(r=>wss.close(r)),new Promise(r=>backend.close(r)),new Promise(r=>agent.close(r))]);});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Gateway startup timeout: ${stderr}`)),5000);child.once('exit',code=>{clearTimeout(timer);reject(Error(`Gateway exited ${code}: ${stderr}`))});child.stdout.on('data',b=>{if(b.toString().includes('Experimental voice gateway')){clearTimeout(timer);resolve()}})});
  const client=new WebSocket(`ws://127.0.0.1:${gatewayPort}/voice`);let completed=false,initialEnd=false,notified=false,notificationAudio=0;
  t.after(()=>client.terminate());
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Gateway integration timed out')),12000);
    const maybeNotify=()=>{if(completed&&initialEnd&&!notified){notified=true;client.send(JSON.stringify({type:'notification.speak',task_id:'fixture-session'}));}};
    client.on('error',reject);
    client.on('message',(data,binary)=>{
      if(binary){if(notified)notificationAudio+=data.length;return;}
      const e=JSON.parse(data);
      if(e.type==='asr.ready'){client.send(JSON.stringify({type:'audio.start'}));client.send(Buffer.alloc(3200));client.send(JSON.stringify({type:'audio.end'}));}
      else if(e.type==='task.completed'){completed=true;assert.equal(e.text,'BLUEBIRD');maybeNotify();}
      else if(e.type==='speech.end'){if(notified){clearTimeout(timer);return resolve();}initialEnd=true;maybeNotify();}
      else if(e.type==='error'||e.type==='task.error'||e.type==='notification.rejected'){clearTimeout(timer);reject(Error(JSON.stringify(e)));}
    });
  });
  assert.deepEqual(calls,['Read fixture.txt and report the secret word']);assert.ok(notificationAudio>0);assert.match(notificationPrompt,/terminee/);assert.equal(requestNumber,3);
});
