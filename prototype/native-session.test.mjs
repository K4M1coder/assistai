import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { NativeSession } from './native-session.mjs';
class Socket extends EventEmitter {
  readyState = 1; bufferedAmount = 0; sent = []; closed = false;
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.closed = true; this.readyState = 3; this.emit('close'); }
  event(value) { this.emit('message', Buffer.from(JSON.stringify(value)), false); }
}
function ready() { const ws = new Socket(); const session = new NativeSession(ws); ws.emit('open'); ws.event({type:'session.created'}); return {ws,session}; }
test('initializes and sends one second of audio or silence when muted', () => {
  const {ws,session} = ready(); assert.equal(ws.sent[0].type, 'session.init');
  const pcm = Buffer.alloc(32000); pcm.writeInt16LE(-32768,0); assert.equal(session.push(pcm),true); assert.equal(session.tick(),true);
  assert.equal(Buffer.from(ws.sent[1].input.audio_base64,'base64').readFloatLE(0),-1);
  session.push(Buffer.alloc(20,1)); session.setMuted(true); session.tick();
  assert.ok(Buffer.from(ws.sent[2].input.audio_base64,'base64').every(x=>x===0)); assert.equal(session.framer.length,0);
});
test('clears partial input on underrun to avoid stale speech', () => {
  const {ws,session} = ready(); let underruns=0; session.on('inputUnderrun',()=>underruns++);
  session.push(Buffer.alloc(4)); session.tick(); assert.equal(underruns,1); assert.equal(session.framer.length,0); assert.equal(ws.sent.length,2);
});
test('routes PCM and does not treat listen as end of audio', () => {
  const {ws,session} = ready(); const got=[]; session.on('audio', x=>got.push(x.readInt16LE(0))); session.on('listen',()=>got.push('listen'));
  const sample=Buffer.alloc(4); sample.writeFloatLE(0.5); ws.event({type:'response.output.delta',kind:'audio',audio:sample.toString('base64')});
  ws.event({type:'response.output.delta',kind:'listen'}); ws.event({type:'response.output.delta',kind:'audio',audio:sample.toString('base64')});
  assert.deepEqual(got,[16384,'listen',16384]);
});
test('closes on malformed audio or transport pressure', () => {
  const a=ready(); let fault; a.session.on('fault',x=>fault=x); a.ws.event({type:'response.output.delta',kind:'audio',audio:'!'}); assert.equal(a.ws.closed,true); assert.match(fault,/Invalid/);
  const b=ready(); b.ws.bufferedAmount=300000; b.session.tick(); assert.equal(b.ws.closed,true);
});
test('closes cleanly when the server ends the session or send fails', () => {
  const a=ready(); a.ws.event({type:'session.closed'}); assert.equal(a.ws.closed,true); assert.equal(a.session.state,'closed');
  const b=ready(); let fault; b.session.on('fault',x=>fault=x); b.ws.send=()=>{throw Error('broken')};
  assert.equal(b.session.tick(),false); assert.equal(b.ws.closed,true); assert.match(fault,/send failed/);
});
