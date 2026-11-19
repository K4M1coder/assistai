import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import WebSocket, { WebSocketServer } from 'ws';

async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;}
test('native gateway does not offer delegation without an agent', {timeout:12000}, async t=>{
 const backend=http.createServer();const sockets=new WebSocketServer({server:backend});const port=await listen(backend);
 let update;const received=new Promise(resolve=>{sockets.on('connection',socket=>{
  socket.send(JSON.stringify({type:'session.created',session:{audio:{input:{format:{rate:16000}},output:{format:{rate:24000}}}}}));
  socket.on('message',raw=>{const event=JSON.parse(raw);if(event.type==='session.update'){update=event.session;socket.send(JSON.stringify({type:'session.updated'}));resolve();}});
 });});
 const reservation=net.createServer();const gatewayPort=await listen(reservation);await new Promise(resolve=>reservation.close(resolve));
 const env={...process.env,ASSISTAI_GATEWAY_PORT:String(gatewayPort),ASSISTAI_DB_PATH:':memory:',ASSISTAI_LFM_REALTIME_URL:`ws://127.0.0.1:${port}/v1/realtime`,
  ASSISTAI_OPENCODE_URL:'',ASSISTAI_LFM_TRANSCRIPT_ASR_URL:'',ASSISTAI_LFM_NOTIFICATION_TTS:'',ASSISTAI_BUDGET_SAMPLE_PATH:'',ASSISTAI_RESOURCE_STATUS_PATH:'',ASSISTAI_SHARED_RESERVATIONS_PATH:''};
 const child=spawn(process.execPath,['prototype/gateway.mjs'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});let stderr='';child.stderr.on('data',data=>stderr+=data);let client;
 t.after(async()=>{client?.terminate();child.kill();for(const socket of sockets.clients)socket.terminate();await Promise.all([new Promise(resolve=>sockets.close(resolve)),new Promise(resolve=>backend.close(resolve))]);});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Gateway timeout: ${stderr}`)),5000);child.once('exit',code=>{clearTimeout(timer);reject(Error(`Gateway exited ${code}: ${stderr}`));});child.stdout.on('data',data=>{if(data.toString().includes('Experimental voice gateway')){clearTimeout(timer);resolve();}});});
 client=new WebSocket(`ws://127.0.0.1:${gatewayPort}/voice`);await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(Error('Missing session configuration')),5000))]);
 assert.deepEqual(update.tools,[]);assert.match(update.instructions,/No background agent is configured/);assert.doesNotMatch(update.instructions,/Delegate substantive tasks/);
});
