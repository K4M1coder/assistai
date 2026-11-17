import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {attachLfmBridge} from './lfm-bridge.mjs';
class Client extends EventEmitter {readyState=1;bufferedAmount=0;sent=[];send(data,opts){this.sent.push(opts?.binary?data:JSON.parse(data));} close(code,reason){this.closeInfo={code,reason};this.readyState=3;this.emit('close')} event(e){this.emit('message',Buffer.from(JSON.stringify(e)),false)} audio(b){this.emit('message',b,true)}}
class Session extends EventEmitter {state='ready';frames=[];results=[];closed=false;appendAudio(b){if(!['ready','collecting'].includes(this.state))return false;this.state='collecting';this.frames.push(b);return true} endAudio(){if(this.state!=='collecting')return false;this.state='waiting';return true} cancel(){if(this.state!=='responding'&&this.state!=='waiting')return false;this.state='cancelling';return true} submitToolResult(id,s){this.results.push([id,JSON.parse(s)]);return true} speakText(text){if(this.state!=='ready')return false;this.state='waiting';this.spoken=text;return true} close(){this.closed=true;this.state='closed';this.emit('closed')}}
function setup(){const client=new Client();const sessions=[];const tasks=[];attachLfmBridge(client,{makeTurnId:()=> 'turn1',sessionFactory:()=>{const s=new Session();sessions.push(s);return s},launchTask:async(t,id)=>{tasks.push([t,id]);return {accepted:true,task_id:'internal-id'}},getCompletedTask:id=>id==='completed'?'BLUEBIRD':null});return {client,sessions,tasks}}
test('ignores idle audio and sends captured speech',()=>{const {client,sessions}=setup();const s=sessions[0];client.audio(Buffer.alloc(2));assert.equal(s.frames.length,0);client.event({type:'audio.start'});client.audio(Buffer.alloc(2));client.event({type:'audio.end'});assert.equal(s.frames.length,1);assert.equal(s.state,'waiting')});
test('interrupt queues new speech until cancellation completes',()=>{const {client,sessions}=setup();const s=sessions[0];s.state='responding';client.event({type:'interrupt'});client.event({type:'audio.start'});client.audio(Buffer.alloc(2));client.event({type:'audio.end'});assert.equal(s.frames.length,0);s.state='ready';s.emit('cancelled');assert.equal(s.frames.length,1);assert.equal(s.state,'waiting');assert.equal(client.sent[0].type,'speech.cancelled')});
test('buffers up to three seconds during cancellation and rejects excess input',()=>{
 const first=setup(),s=first.sessions[0];s.state='responding';first.client.event({type:'interrupt'});first.client.event({type:'audio.start'});
 for(let i=0;i<30;i++)first.client.audio(Buffer.alloc(3200));first.client.event({type:'audio.end'});s.state='ready';s.emit('cancelled');
 assert.equal(s.frames.reduce((sum,frame)=>sum+frame.length,0),96000);assert.equal(s.state,'waiting');
 const second=setup(),t=second.sessions[0];t.state='responding';second.client.event({type:'interrupt'});second.client.event({type:'audio.start'});
 for(let i=0;i<31;i++)second.client.audio(Buffer.alloc(3200));
 assert.match(second.client.sent.at(-1).message,/three-second buffer/);t.state='ready';t.emit('cancelled');assert.equal(t.frames.length,0);
});
test('overflow stops the parallel transcript for the discarded turn',()=>{
 const client=new Client();let session;let stops=0;let appends=0;
 attachLfmBridge(client,{makeTurnId:()=> 'turn1',sessionFactory:()=>session=new Session(),transcriptUrl:'ws://127.0.0.1/asr',
  transcriptFactory:()=>({start(){},append(){appends++},end(){},stop(){stops++}})});
 session.state='responding';client.event({type:'interrupt'});client.event({type:'audio.start'});
 for(let i=0;i<31;i++)client.audio(Buffer.alloc(3200));
 assert.equal(appends,31);assert.equal(stops,2); // interrupt and discarded turn
 assert.equal(client.sent.at(-2).type,'transcript.unavailable');
 assert.match(client.sent.at(-1).message,/three-second buffer/);
});
test('partial input reset replaces backend session',()=>{const {client,sessions}=setup();client.event({type:'audio.start'});client.audio(Buffer.alloc(2));client.event({type:'audio.reset'});assert.equal(sessions.length,2);assert.equal(sessions[0].closed,true)});
test('unexpected native backend closure disconnects the client for recovery',()=>{const {client,sessions}=setup();sessions[0].close();assert.deepEqual(client.closeInfo,{code:1011,reason:'Native speech disconnected'});assert.match(client.sent.at(-1).message,/connection closed/)});
test('native backend fault is reported once before disconnect',()=>{const {client,sessions}=setup();sessions[0].emit('fault','Realtime transport error');sessions[0].close();assert.equal(client.sent.filter(e=>e.type==='error').length,1);assert.equal(client.closeInfo.code,1011)});
test('delegates explicit tool call and sends bounded result',async()=>{const {client,sessions,tasks}=setup();const s=sessions[0];client.event({type:'audio.start'});s.emit('toolCall',{name:'delegate_task',callId:'1',arguments:'{"task":"read fixture"}'});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(tasks,[['read fixture','turn1']]);assert.deepEqual(s.results,[['1',{accepted:true}]])});
test('starts separate delegated calls without waiting for the first',async()=>{
 const client=new Client();let session;const pending=new Map(),started=[];
 attachLfmBridge(client,{makeTurnId:()=> 'turn1',sessionFactory:()=>session=new Session(),launchTask:task=>{started.push(task);return new Promise(resolve=>pending.set(task,resolve));}});
 client.event({type:'audio.start'});session.emit('toolCall',{name:'delegate_task',callId:'1',arguments:'{"task":"one"}'});session.emit('toolCall',{name:'delegate_task',callId:'2',arguments:'{"task":"two"}'});
 assert.deepEqual(started,['one','two']);pending.get('two')({accepted:true});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(session.results,[['2',{accepted:true}]]);pending.get('one')({accepted:true});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(session.results,[['2',{accepted:true}],['1',{accepted:true}]]);
});
test('interrupt during tool submission resets voice without submitting a stale tool result',async()=>{
 const client=new Client(),sessions=[];let finishTask;const task=new Promise(resolve=>{finishTask=resolve});
 attachLfmBridge(client,{makeTurnId:()=> 'turn1',sessionFactory:()=>{const s=new Session();sessions.push(s);return s},launchTask:()=>task});
 client.event({type:'audio.start'});const old=sessions[0];old.state='awaiting_tool';
 old.emit('toolCall',{name:'delegate_task',callId:'1',arguments:'{"task":"read fixture"}'});
 client.event({type:'interrupt'});assert.equal(old.closed,true);assert.equal(sessions.length,2);
 assert.deepEqual(client.sent.slice(-2).map(e=>e.type),['speech.cancelled','asr.reconnecting']);
 finishTask({accepted:true});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(old.results,[]);
 sessions[1].state='connecting';client.event({type:'audio.start'});client.audio(Buffer.alloc(2));client.event({type:'audio.end'});
 assert.equal(sessions[1].frames.length,0);sessions[1].state='ready';sessions[1].emit('ready');
 assert.equal(sessions[1].frames.length,1);assert.equal(sessions[1].state,'waiting');
});
test('preserves an uncertain task refusal in the tool result',async()=>{const client=new Client();let session;attachLfmBridge(client,{makeTurnId:()=> 'turn1',sessionFactory:()=>session=new Session(),launchTask:async()=>({accepted:false,error:'A matching task may still be running.'})});client.event({type:'audio.start'});session.emit('toolCall',{name:'delegate_task',callId:'1',arguments:'{"task":"read fixture"}'});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(session.results,[['1',{accepted:false,error:'A matching task may still be running.'}]])});
test('delivers output and completes a text-only response',()=>{const {client,sessions}=setup();const s=sessions[0];client.event({type:'audio.start'});s.emit('responseStart');s.emit('text','hello');s.emit('responseDone');assert.equal(client.sent.at(-2).type,'assistant.text');assert.equal(client.sent.at(-1).type,'speech.end')});

test('only completed tasks can trigger a spoken notification containing the result',()=>{const {client,sessions}=setup();client.event({type:'notification.speak',task_id:'unknown'});assert.equal(client.sent.at(-1).reason,'unavailable');sessions[0].state='waiting';client.event({type:'notification.speak',task_id:'completed'});assert.equal(client.sent.at(-1).reason,'busy');sessions[0].state='ready';client.event({type:'notification.speak',task_id:'completed'});assert.equal(client.sent.at(-1).type,'notification.started');assert.match(sessions[0].spoken,/BLUEBIRD/)});
