import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeInputFramer, nativeAudioToPcm16 } from './native-audio.mjs';
test('frames fragmented PCM16 and preserves a partial frame', () => {
  const f = new NativeInputFramer({ samplesPerFrame: 3 });
  const pcm = Buffer.alloc(8); [-32768, 0, 32767, 123].forEach((x,i) => pcm.writeInt16LE(x,i*2));
  f.push(pcm.subarray(0,2)); assert.equal(f.take(), null); f.push(pcm.subarray(2));
  const result = Buffer.from(f.take(), 'base64');
  assert.deepEqual([result.readFloatLE(0), result.readFloatLE(4), result.readFloatLE(8)], [-1, 0, 32767/32768]);
  assert.equal(f.length, 1); f.reset(); assert.equal(f.length, 0);
});
test('rejects misaligned input and bounded-buffer overflow', () => {
  const f = new NativeInputFramer({ samplesPerFrame: 2, maxFrames: 1 });
  assert.throws(() => f.push(Buffer.alloc(1)), TypeError);
  assert.throws(() => f.push(Buffer.alloc(6)), RangeError);
  assert.equal(f.length, 0);
});
test('converts native float32 output to clipped PCM16', () => {
  const data = Buffer.alloc(20); [-2,-1,0,0.5,2].forEach((x,i) => data.writeFloatLE(x,i*4));
  const out = nativeAudioToPcm16(data.toString('base64'));
  assert.deepEqual(Array.from({length:5}, (_,i) => out.readInt16LE(i*2)), [-32768,-32768,0,16384,32767]);
  assert.throws(() => nativeAudioToPcm16('%%%'), TypeError);
  assert.throws(() => nativeAudioToPcm16(Buffer.alloc(3).toString('base64')), TypeError);
  data.writeFloatLE(NaN,0); assert.throws(() => nativeAudioToPcm16(data.toString('base64')), TypeError);
});
