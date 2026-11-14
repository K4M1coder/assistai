import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createNativeTranscript } from './native-transcript.mjs';

class Socket extends EventEmitter {
  bufferedAmount = 0; sent = []; closed = false;
  send(data) { this.sent.push(data); }
  close() { this.closed = true; }
  event(value) { this.emit('message', Buffer.from(JSON.stringify(value))); }
}
function setup() {
  const sockets = [], events = [];
  const transcript = createNativeTranscript({ url:'ws://example', send:e=>events.push(e), socketFactory:()=>{const socket=new Socket();sockets.push(socket);return socket;} });
  return { sockets, events, transcript };
}
test('buffers audio until ready and combines segments with final text', () => {
  const { sockets, events, transcript }=setup();
  transcript.start('turn'); transcript.append(Buffer.alloc(2)); transcript.end();
  sockets[0].event({type:'ready'});
  assert.equal(sockets[0].sent.length,2);
  sockets[0].event({type:'segment',text:'bonjour'}); sockets[0].event({type:'final',text:'le monde'});
  assert.deepEqual(events.at(-1),{type:'user.text',turn_id:'turn',text:'bonjour le monde',source:'parallel-asr'});
  assert.equal(sockets[0].closed,true);
});
test('drops late results after a new turn and bounds startup buffering', () => {
  const { sockets, events, transcript }=setup();
  transcript.start('old'); transcript.start('new'); sockets[0].event({type:'final',text:'stale'});
  assert.equal(events.length,0); transcript.append(Buffer.alloc(32001));
  assert.deepEqual(events,[{type:'transcript.unavailable',turn_id:'new'}]);
});
test('reports unavailable instead of throwing when the ASR socket fails during queued flush', () => {
  const { sockets, events, transcript }=setup();
  transcript.start('turn'); transcript.append(Buffer.alloc(2)); transcript.end();
  sockets[0].send=()=>{throw Error('socket closed');};
  assert.doesNotThrow(()=>sockets[0].event({type:'ready'}));
  assert.deepEqual(events,[{type:'transcript.unavailable',turn_id:'turn'}]);
  assert.equal(sockets[0].closed,true);
});
test('reports unavailable if a live audio or end send fails', () => {
  for (const duringEnd of [false,true]) {
    const { sockets, events, transcript }=setup();
    transcript.start('turn'); sockets[0].event({type:'ready'});
    sockets[0].send=()=>{throw Error('socket closed');};
    assert.doesNotThrow(()=>duringEnd ? transcript.end() : transcript.append(Buffer.alloc(2)));
    assert.deepEqual(events,[{type:'transcript.unavailable',turn_id:'turn'}]);
  }
});
