// Synthetic real-model check of context after an upstream native speech reset.
import { readFile } from 'node:fs/promises';
import WebSocket from 'ws';
async function pcm(path) {
  const wav=await readFile(path); const p=wav.indexOf('data');
  if(p<0||wav.readUInt32LE(24)!==16000)throw Error('Expected 16 kHz WAV');
  return wav.subarray(p+8,p+8+wav.readUInt32LE(p+4));
}
const first=await pcm('.cache/lfm3-fixture-french.wav');
const question=await pcm('.cache/reset-question.wav');
const ws=new WebSocket('ws://127.0.0.1:18093/voice');
let phase='connecting', completed=false, initialEnd=false, taskCount=0, answer='', audioBytes=0, failure=null;
const timer=setTimeout(()=>{failure='timeout';ws.close();},120000);
async function utterance(data) {
  ws.send(JSON.stringify({type:'audio.start'}));
  for(let i=0;i<data.length;i+=3200){if(ws.readyState!==WebSocket.OPEN)return;ws.send(data.subarray(i,i+3200));await new Promise(r=>setTimeout(r,100));}
  ws.send(JSON.stringify({type:'audio.end'}));
}
function maybeReset() {
  if(phase!=='initial'||!completed||!initialEnd)return;
  phase='resetting';ws.send(JSON.stringify({type:'audio.start'}));ws.send(Buffer.alloc(3200));ws.send(JSON.stringify({type:'audio.reset'}));
}
ws.on('message',(data,binary)=>{
  if(binary){if(phase==='followup')audioBytes+=data.length;return;}
  const e=JSON.parse(data);
  if(e.type==='asr.ready'&&phase==='connecting'){phase='initial';void utterance(first);}
  else if(e.type==='asr.ready'&&phase==='resetting'){phase='followup';void utterance(question);}
  else if(e.type==='task.started')taskCount++;
  else if(e.type==='task.completed'){completed=/BLUEBIRD/i.test(e.text);if(!completed){failure='unexpected task result';ws.close();}else maybeReset();}
  else if(e.type==='assistant.text'&&phase==='followup')answer+=e.text;
  else if(e.type==='speech.end'&&phase==='initial'){initialEnd=true;maybeReset();}
  else if(e.type==='speech.end'&&phase==='followup'){phase='done';ws.close();}
  else if(e.type==='error'||e.type==='task.error'||e.type==='transcript.unavailable'){failure=e.message??e.type;ws.close();}
});
ws.on('error',e=>{failure=e.message});
ws.on('close',()=>{clearTimeout(timer);console.log(JSON.stringify({phase,completed,taskCount,answer,audioBytes,failure}));if(phase!=='done'||!completed||taskCount!==1||!/BLUEBIRD/i.test(answer)||!audioBytes||failure)process.exitCode=1;});
