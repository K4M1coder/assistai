import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
async function fetchJson(req) { const parts=[];for await(const b of req)parts.push(b);return JSON.parse(Buffer.concat(parts).toString()||'{}'); }

test('opt-in gateway delegates a task and speaks its completion notification', {timeout:20000}, async t => {
  const calls=[]; const sessionInstructions=[]; let requestNumber=0; let notificationPrompt=''; let rejectedToolResult='';
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
      if(e.type==='session.update'){sessionInstructions.push(e.session.instructions);socket.send(JSON.stringify({type:'session.updated'}));}
      if(e.type==='conversation.item.create' && e.item?.role==='user') notificationPrompt=e.item.content[0].text;
      if(e.type==='conversation.item.create' && e.item?.type==='function_call_output') rejectedToolResult=e.item.output;
      if(e.type!=='response.create')return;
      requestNumber++;const id=`r${requestNumber}`;
      socket.send(JSON.stringify({type:'response.created',response:{id}}));
      if(requestNumber===1 || requestNumber===4){socket.send(JSON.stringify({type:'response.done',response:{id,status:'completed',output:[{type:'function_call',name:'delegate_task',call_id:`call${requestNumber}`,arguments:JSON.stringify({task:'Read fixture.txt and report the secret word'})}]}}));return;}
      if(requestNumber===3)assert.equal(e.response.tool_choice,'none');
      socket.send(JSON.stringify({type:'response.output_text.delta',response_id:id,delta:requestNumber===2?'Task started.':'Task finished.'}));
      socket.send(JSON.stringify({type:'response.output_audio.delta',response_id:id,delta:Buffer.from([1,0,2,0]).toString('base64')}));
      socket.send(JSON.stringify({type:'response.done',response:{id,status:'completed',output:[]}}));
    });
  });
  const backendPort=await listen(backend);
  const asrServer=http.createServer();const asrSockets=new WebSocketServer({server:asrServer});
  asrSockets.on('connection',socket=>{
    socket.send(JSON.stringify({type:'ready'}));
    socket.on('message',(data,binary)=>{if(!binary&&JSON.parse(data).type==='end')socket.send(JSON.stringify({type:'final',text:'spoken fixture'}));});
  });
  const asrPort=await listen(asrServer);
  const reservation=http.createServer();const gatewayPort=await listen(reservation);await new Promise(resolve=>reservation.close(resolve));
  const root=process.cwd();const cache=path.resolve(root,'.cache');await mkdir(cache,{recursive:true});const temp=await mkdtemp(path.join(cache,'lfm-gateway-integration-'));
  const budgetPath=path.join(temp,'budget.json');
  await writeFile(budgetPath,JSON.stringify({observedAt:new Date().toISOString(),dedicatedBytes:0,sharedBytes:0,availableRamBytes:10*1024**3}));
  const env={...process.env,ASSISTAI_GATEWAY_PORT:String(gatewayPort),ASSISTAI_LFM_REALTIME_URL:`ws://127.0.0.1:${backendPort}/v1/realtime`,ASSISTAI_LFM_TRANSCRIPT_ASR_URL:`ws://127.0.0.1:${asrPort}/asr`,ASSISTAI_OPENCODE_URL:`http://127.0.0.1:${agentPort}`,ASSISTAI_DB_PATH:path.join(temp,'events.sqlite'),ASSISTAI_BUDGET_SAMPLE_PATH:budgetPath,ASSISTAI_BUDGET_BASELINE_SHARED_BYTES:'0',ASSISTAI_TASK_VRAM_ESTIMATE_BYTES:'1',ASSISTAI_TASK_RAM_ESTIMATE_BYTES:'1'};
  const child=spawn(process.execPath,['prototype/gateway.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stderr='';child.stderr.on('data',x=>{stderr+=x});
  t.after(async()=>{child.kill();for(const c of wss.clients)c.terminate();for(const c of asrSockets.clients)c.terminate();await Promise.all([new Promise(r=>wss.close(r)),new Promise(r=>asrSockets.close(r)),new Promise(r=>asrServer.close(r)),new Promise(r=>backend.close(r)),new Promise(r=>agent.close(r))]);});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Gateway startup timeout: ${stderr}`)),5000);child.once('exit',code=>{clearTimeout(timer);reject(Error(`Gateway exited ${code}: ${stderr}`))});child.stdout.on('data',b=>{if(b.toString().includes('Experimental voice gateway')){clearTimeout(timer);resolve()}})});
  const client=new WebSocket(`ws://127.0.0.1:${gatewayPort}/voice`);let completed=false,initialEnd=false,notified=false,notificationAudio=0,capabilities,transcript;
  t.after(()=>client.terminate());
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Gateway integration timed out')),12000);
    const maybeNotify=()=>{if(completed&&initialEnd&&!notified){notified=true;client.send(JSON.stringify({type:'notification.speak',task_id:'fixture-session'}));}};
    client.on('error',reject);
    client.on('message',(data,binary)=>{
      if(binary){if(notified)notificationAudio+=data.length;return;}
      const e=JSON.parse(data);
      if(e.type==='session.capabilities')capabilities=e;
      else if(e.type==='user.text')transcript=e;
      else if(e.type==='asr.ready'){client.send(JSON.stringify({type:'audio.start'}));client.send(Buffer.alloc(3200));client.send(JSON.stringify({type:'audio.end'}));}
      else if(e.type==='task.completed'){completed=true;assert.equal(e.text,'BLUEBIRD');maybeNotify();}
      else if(e.type==='speech.end'){if(notified){clearTimeout(timer);return resolve();}initialEnd=true;maybeNotify();}
      else if(e.type==='error'||e.type==='task.error'||e.type==='notification.rejected'){clearTimeout(timer);reject(Error(JSON.stringify(e)));}
    });
  });
  assert.deepEqual(capabilities,{type:'session.capabilities',mode:'native-speech',text_input:false,image_input:false,input_transcript:true});assert.equal(transcript?.text,'spoken fixture');assert.equal(transcript?.source,'parallel-asr');assert.deepEqual(calls,['Read fixture.txt and report the secret word']);assert.ok(notificationAudio>0);assert.match(notificationPrompt,/BLUEBIRD/);assert.equal(requestNumber,3);
  await unlink(budgetPath);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Missing-sample rejection timed out')),5000);
    let rejected=false;
    client.on('message',(data,binary)=>{
      if(binary)return;
      const e=JSON.parse(data);
      if(e.type==='task.rejected'){rejected=true;assert.match(e.message,/resource admission/);}
      if(e.type==='speech.end'&&rejected){clearTimeout(timer);resolve();}
    });
    client.send(JSON.stringify({type:'audio.start'}));client.send(Buffer.alloc(3200));client.send(JSON.stringify({type:'audio.end'}));
  });
  assert.equal(calls.length,1);
  assert.equal(JSON.parse(rejectedToolResult).accepted,false);
  client.removeAllListeners('message');
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Session reset timed out')),5000);
    client.on('message',(data,binary)=>{if(!binary&&JSON.parse(data).type==='asr.ready'){clearTimeout(timer);resolve();}});
    client.send(JSON.stringify({type:'audio.start'}));client.send(Buffer.alloc(3200));client.send(JSON.stringify({type:'audio.reset'}));
  });
  assert.equal(sessionInstructions.length,2);
  assert.match(sessionInstructions[1],/spoken fixture/);
  assert.match(sessionInstructions[1],/approximate parallel transcript/);
  assert.match(sessionInstructions[1],/BLUEBIRD/);
});
