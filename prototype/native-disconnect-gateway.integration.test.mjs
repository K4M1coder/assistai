import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }

test('native backend loss closes gateway WebSocket with a recovery code', {timeout:10000}, async t => {
  const backend = http.createServer(); const sockets = new WebSocketServer({server:backend});
  let backendSocket;
  sockets.on('connection', socket => {
    backendSocket = socket;
    socket.send(JSON.stringify({type:'session.created',session:{audio:{input:{format:{rate:16000}},output:{format:{rate:24000}}}}}));
    socket.on('message', data => { if (JSON.parse(data).type === 'session.update') socket.send(JSON.stringify({type:'session.updated'})); });
  });
  const backendPort = await listen(backend);
  const reserve = http.createServer(); const port = await listen(reserve); await new Promise(resolve => reserve.close(resolve));
  const env = {...process.env, ASSISTAI_GATEWAY_PORT:String(port), ASSISTAI_DB_PATH:':memory:', ASSISTAI_OPENCODE_URL:'',
    ASSISTAI_LFM_REALTIME_URL:`ws://127.0.0.1:${backendPort}/v1/realtime`, ASSISTAI_LFM_TRANSCRIPT_ASR_URL:'',
    ASSISTAI_BUDGET_SAMPLE_PATH:'', ASSISTAI_RESOURCE_STATUS_PATH:'', ASSISTAI_SHARED_RESERVATIONS_PATH:''};
  const child = spawn(process.execPath, ['prototype/gateway.mjs'], {env, windowsHide:true, stdio:['ignore','pipe','pipe']});
  let stderr=''; child.stderr.on('data', data => {stderr += data;});
  let client;
  t.after(async () => {
    client?.terminate();
    if(child.exitCode === null) {child.kill(); await once(child, 'exit');}
    for(const socket of sockets.clients) socket.terminate();
    await new Promise(resolve => sockets.close(resolve)); await new Promise(resolve => backend.close(resolve));
  });
  await new Promise((resolve,reject) => {
    const timeout=setTimeout(()=>reject(Error(`Gateway startup timeout: ${stderr}`)),5000);
    child.once('exit',code=>{clearTimeout(timeout);reject(Error(`Gateway exited ${code}: ${stderr}`));});
    child.stdout.on('data',data=>{if(data.toString().includes('Experimental voice gateway')){clearTimeout(timeout);resolve();}});
  });
  client = new WebSocket(`ws://127.0.0.1:${port}/voice`);
  const result = await new Promise((resolve,reject) => {
    const timeout=setTimeout(()=>reject(Error('Disconnect test timed out')),5000);
    let message;
    client.on('error',error=>{clearTimeout(timeout);reject(error);});
    client.on('message',(data,binary)=>{
      if(binary)return;
      const event=JSON.parse(data);
      if(event.type==='asr.ready') backendSocket.close();
      if(event.type==='error') message=event.message;
    });
    client.on('close',(code,reason)=>{clearTimeout(timeout);resolve({code,reason:reason.toString(),message});});
  });
  assert.deepEqual(result,{code:1011,reason:'Native speech disconnected',message:'Native speech connection closed.'});
});
