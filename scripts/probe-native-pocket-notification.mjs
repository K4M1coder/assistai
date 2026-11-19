// Actual gateway and Pocket TTS; native model is simulated, agent may be real.
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import WebSocket, { WebSocketServer } from 'ws';

async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;}
const realAgent=process.argv.includes('--real-agent');
const agent=http.createServer((req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.method==='POST'&&req.url==='/session')return res.end(JSON.stringify({id:'fixture-session'}));
  if(req.method==='POST'&&req.url==='/session/fixture-session/prompt_async'){res.statusCode=204;return res.end();}
  if(req.url==='/session/status')return res.end('{}');
  if(req.url==='/session/fixture-session/message')return res.end(JSON.stringify([{info:{role:'assistant',finish:'stop',time:{completed:1}},parts:[{type:'text',text:'Le mot secret est BLUEBIRD.'}]}]));
  res.statusCode=404;res.end('{}');
});
const agentPort=realAgent?18085:await listen(agent);
const backend=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'mock-native',owned_by:'llamacpp'}]}));});
const wss=new WebSocketServer({server:backend});let requests=0;
wss.on('connection',socket=>{
  socket.send(JSON.stringify({type:'session.created',session:{audio:{input:{format:{rate:16000}},output:{format:{rate:24000}}}}}));
  socket.on('message',raw=>{
    const e=JSON.parse(raw);
    if(e.type==='session.update')return socket.send(JSON.stringify({type:'session.updated'}));
    if(e.type!=='response.create')return;
    requests++;const id=`r${requests}`;socket.send(JSON.stringify({type:'response.created',response:{id}}));
    if(requests===1)return socket.send(JSON.stringify({type:'response.done',response:{id,status:'completed',output:[{type:'function_call',name:'delegate_task',call_id:'c1',arguments:'{"task":"Read fixture.txt and report the secret word."}'}]}}));
    socket.send(JSON.stringify({type:'response.output_audio.delta',response_id:id,delta:Buffer.from([1,0,2,0]).toString('base64')}));
    socket.send(JSON.stringify({type:'response.done',response:{id,status:'completed',output:[]}}));
  });
});
const backendPort=await listen(backend);const reservation=net.createServer();const port=await listen(reservation);await new Promise(resolve=>reservation.close(resolve));
const env={...process.env,ASSISTAI_GATEWAY_PORT:String(port),ASSISTAI_DB_PATH:':memory:',ASSISTAI_LFM_REALTIME_URL:`ws://127.0.0.1:${backendPort}/v1/realtime`,
  ASSISTAI_LFM_TRANSCRIPT_ASR_URL:'',ASSISTAI_LFM_NOTIFICATION_TTS:'1',ASSISTAI_TTS_URL:'http://127.0.0.1:18081',ASSISTAI_OPENCODE_URL:`http://127.0.0.1:${agentPort}`,
  ASSISTAI_BUDGET_SAMPLE_PATH:realAgent?'.cache/assistant/demo-18131-resource.json':'',ASSISTAI_RESOURCE_STATUS_PATH:'',
  ASSISTAI_SHARED_RESERVATIONS_PATH:realAgent?'.cache/assistant/task-reservations.sqlite':'',ASSISTAI_BUDGET_BASELINE_SHARED_BYTES:'0',
  ASSISTAI_TASK_VRAM_ESTIMATE_BYTES:String(512*1024**2),ASSISTAI_TASK_RAM_ESTIMATE_BYTES:String(3*1024**3)};
const gateway=spawn(process.execPath,['prototype/gateway.mjs'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});let stderr='',client;
gateway.stderr.on('data',data=>stderr+=data);
try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Gateway startup timeout: ${stderr}`)),10000);gateway.once('exit',code=>{clearTimeout(timer);reject(Error(`Gateway exited ${code}: ${stderr}`));});gateway.stdout.on('data',data=>{if(data.toString().includes('Experimental voice gateway')){clearTimeout(timer);resolve();}});});
  const status=await (await fetch(`http://127.0.0.1:${port}/services`)).json();
  const tts=status.services.find(item=>item.role==='Task notification synthesis');
  client=new WebSocket(`ws://127.0.0.1:${port}/voice`);
  let taskId=null,initialEnd=false,notification=false,notificationBytes=0,text='',capability=null;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Notification probe timed out; task may still be running')),90000);
    const maybeNotify=()=>{if(taskId&&initialEnd){initialEnd=false;client.send(JSON.stringify({type:'notification.speak',task_id:taskId}));}};
    client.on('error',reject);
    client.on('message',(raw,binary)=>{
      if(binary){if(notification)notificationBytes+=raw.length;return;}
      const event=JSON.parse(raw);
      if(event.type==='session.capabilities')capability=event.notification_synthesis;
      else if(event.type==='asr.ready'){client.send(JSON.stringify({type:'audio.start'}));client.send(Buffer.alloc(3200));client.send(JSON.stringify({type:'audio.end'}));}
      else if(event.type==='task.completed'){taskId=event.task_id;maybeNotify();}
      else if(event.type==='notification.started')notification=true;
      else if(event.type==='assistant.text'&&notification)text=event.text;
      else if(event.type==='speech.end'){if(notification){clearTimeout(timer);resolve();}else{initialEnd=true;maybeNotify();}}
      else if(['error','task.error','task.rejected','notification.rejected'].includes(event.type)){clearTimeout(timer);reject(Error(JSON.stringify(event)));}
    });
  });
  console.log(JSON.stringify({notificationBytes,text,capability,ttsAvailable:tts?.available,ttsEngine:tts?.engine,nativeModel:'simulated',agent:realAgent?'real read-only fixture':'simulated',tts:'real local service',physicalDevicesOpened:false}));
  if(!notificationBytes||!text.includes('BLUEBIRD')||capability!=='local-tts'||!tts?.available||requests!==2)process.exitCode=1;
} finally {
  client?.terminate();gateway.kill();for(const socket of wss.clients)socket.terminate();
  await Promise.all([new Promise(resolve=>wss.close(resolve)),new Promise(resolve=>backend.close(resolve)),...(realAgent?[]:[new Promise(resolve=>agent.close(resolve))])]);
}
