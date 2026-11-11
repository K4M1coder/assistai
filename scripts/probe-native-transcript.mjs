// Replay raw 16 kHz mono PCM16 through the optional native-path ASR adapter.
import { readFile } from 'node:fs/promises';
import { createNativeTranscript } from '../prototype/native-transcript.mjs';
const [path] = process.argv.slice(2);
if (!path) throw Error('Pass a 16 kHz mono PCM16 fixture path');
const audio = await readFile(path);
if (!audio.length || audio.length % 2) throw Error('Invalid PCM16 fixture');
let finish;
const done = new Promise(resolve => { finish = resolve; });
const events = [];
const transcript = createNativeTranscript({ url:process.env.ASSISTAI_ASR_URL ?? 'ws://127.0.0.1:18082/asr', send:event=>{
  events.push(event);
  if (['user.text','transcript.empty','transcript.unavailable'].includes(event.type)) finish(event);
} });
transcript.start('fixture');
for (let offset=0; offset<audio.length; offset+=3200) {
  transcript.append(audio.subarray(offset,offset+3200));
  await new Promise(resolve=>setTimeout(resolve,100));
}
transcript.end();
let timer;
const result = await Promise.race([done, new Promise(resolve=>{timer=setTimeout(()=>resolve({type:'timeout'}),10000);})]);
clearTimeout(timer); transcript.stop();
console.log(JSON.stringify({result, partials:events.filter(e=>e.type==='asr.partial').length}));
if (result.type !== 'user.text' || !result.text) process.exitCode=1;
