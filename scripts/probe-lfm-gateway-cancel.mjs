// Synthetic gateway interruption and follow-up test. No microphone is used.
import {readFile} from 'node:fs/promises';import WebSocket from 'ws';
const wav=await readFile('.cache/omni-english/utterance.wav');const p=wav.indexOf('data');if(p<0||wav.readUInt32LE(24)!==16000)throw Error('Expected 16 kHz WAV');
const pcm=wav.subarray(p+8,p+8+wav.readUInt32LE(p+4));const ws=new WebSocket('ws://127.0.0.1:18093/voice');
let ready=false,firstAudio=false,interruptSent=false,cancelled=false,secondStarted=false,secondAudio=0,lateAudio=0,done=false,failure=null;
const timer=setTimeout(()=>{failure='timeout';ws.close()},90000);
async function utterance(){ws.send(JSON.stringify({type:'audio.start'}));for(let i=0;i<pcm.length;i+=3200){if(ws.readyState!==WebSocket.OPEN)return;ws.send(pcm.subarray(i,i+3200));await new Promise(r=>setTimeout(r,100));}ws.send(JSON.stringify({type:'audio.end'}));}
ws.on('message',(data,binary)=>{
 if(binary){if(!interruptSent){firstAudio=true;interruptSent=true;ws.send(JSON.stringify({type:'interrupt',reason:'manual'}));}else if(cancelled&&!secondStarted)lateAudio+=data.length;else if(secondStarted)secondAudio+=data.length;return;}
 const e=JSON.parse(data);
 if(e.type==='asr.ready'&&!ready){ready=true;void utterance();}
 else if(e.type==='speech.cancelled'&&!cancelled){cancelled=true;void utterance();}
 else if(e.type==='speech.start'&&cancelled)secondStarted=true;
 else if(e.type==='speech.end'&&secondStarted){done=true;ws.close();}
 else if(e.type==='error'){failure=e.message;ws.close();}
});
ws.on('error',e=>failure=e.message);ws.on('close',()=>{clearTimeout(timer);console.log(JSON.stringify({ready,firstAudio,cancelled,lateAudio,secondStarted,secondAudio,done,failure}));if(!ready||!firstAudio||!cancelled||lateAudio||!secondStarted||!secondAudio||!done||failure)process.exitCode=1});
