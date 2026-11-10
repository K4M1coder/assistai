import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { LfmRealtimeSession } from './lfm-realtime-session.mjs';
class Socket extends EventEmitter {
  readyState=1; bufferedAmount=0; sent=[]; closed=false;
  send(s){this.sent.push(JSON.parse(s));} close(){this.closed=true;this.readyState=3;this.emit('close');}
  event(e){this.emit('message',Buffer.from(JSON.stringify(e)),false);}
}
function session(){const ws=new Socket();const a=new LfmRealtimeSession(ws,{instructions:'test'});ws.event({type:'session.created',session:{audio:{input:{format:{rate:16000}},output:{format:{rate:24000}}}}});ws.event({type:'session.updated'});return {ws,a};}
function response(ws,id){ws.event({type:'response.created',response:{id}});}
test('streams input and emits only matching response data',()=>{
 const {ws,a}=session();assert.equal(a.appendAudio(Buffer.alloc(3200)),true);assert.equal(a.endAudio(),true);response(ws,'r1');
 const got=[];a.on('audio',b=>got.push(b.length));a.on('text',s=>got.push(s));
 ws.event({type:'response.output_audio.delta',response_id:'other',delta:Buffer.alloc(4).toString('base64')});
 ws.event({type:'response.output_audio.delta',response_id:'r1',delta:Buffer.alloc(4).toString('base64')});
 ws.event({type:'response.output_text.delta',response_id:'r1',delta:'hello'});
 ws.event({type:'response.done',response:{id:'r1',status:'completed',output:[]}});
 assert.deepEqual(got,[4,'hello']);assert.equal(a.state,'ready');
});
test('cancellation drops late audio until matching completion',()=>{
 const {ws,a}=session();a.appendAudio(Buffer.alloc(2));a.endAudio();response(ws,'r1');let count=0;a.on('audio',()=>count++);a.cancel();
 ws.event({type:'response.output_audio.delta',response_id:'r1',delta:Buffer.alloc(4).toString('base64')});
 assert.equal(count,0);assert.equal(a.appendAudio(Buffer.alloc(2)),false);
 ws.event({type:'response.done',response:{id:'r1',status:'cancelled',output:[]}});assert.equal(a.state,'ready');
 assert.equal(ws.sent.at(-1).type,'response.cancel');
});
test('tool calls require explicit result and request audio only for continuation',()=>{
 const {ws,a}=session();a.appendAudio(Buffer.alloc(2));a.endAudio();response(ws,'r1');let seen;a.on('toolCall',c=>seen=c);
 ws.event({type:'response.done',response:{id:'r1',status:'completed',output:[{type:'function_call',name:'delegate_task',call_id:'c1',arguments:'{"task":"read"}'}]}});
 assert.equal(seen.callId,'c1');assert.equal(a.submitToolResult('other','ok'),false);assert.equal(a.submitToolResult('c1','ok'),true);
 assert.equal(ws.sent.at(-2).item.call_id,'c1');assert.deepEqual(ws.sent.at(-1).response.output_modalities,['text','audio']);
});
test('rejects input overflow, malformed audio, and transport pressure',()=>{
 const x=session();x.a.appendAudio(Buffer.alloc(960002));assert.equal(x.ws.closed,true);
 const y=session();y.a.appendAudio(Buffer.alloc(2));y.a.endAudio();response(y.ws,'r1');y.ws.event({type:'response.output_audio.delta',response_id:'r1',delta:'%%%'});assert.equal(y.ws.closed,true);
 const z=session();z.ws.bufferedAmount=300000;assert.equal(z.a.appendAudio(Buffer.alloc(2)),false);assert.equal(z.ws.closed,true);
});
