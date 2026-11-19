import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamTtsNotification } from './tts-notification.mjs';

function wav(pcm=Buffer.from([1,0,2,0])) {
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);
  header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);
  header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header,pcm]);
}
test('streams split WAV header and PCM with the declared sample rate',async()=>{
  const data=wav(), output=[];let rate;
  const fetcher=async()=>({ok:true,body:(async function*(){yield data.subarray(0,12);yield data.subarray(12,45);yield data.subarray(45)})()});
  await streamTtsNotification({url:'http://localhost',text:'Bonjour',signal:new AbortController().signal,onFormat:value=>rate=value,onAudio:value=>output.push(value),fetcher});
  assert.equal(rate,24000);assert.deepEqual(Buffer.concat(output),data.subarray(44));
});
test('rejects malformed and truncated audio',async()=>{
  const invalid=wav(Buffer.from([1]));
  const fetcher=async()=>({ok:true,body:(async function*(){yield invalid})()});
  await assert.rejects(streamTtsNotification({url:'http://localhost',text:'x',signal:new AbortController().signal,onFormat(){},onAudio(){},fetcher}),/incomplete/);
});
