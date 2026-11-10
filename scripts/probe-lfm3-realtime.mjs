// Synthetic French speech only. Does not connect to a microphone or execute tools.
import { readFile } from 'node:fs/promises';
import WebSocket from 'ws';
const wav = await readFile('.cache/omni-french/utterance.wav');
const offset=wav.indexOf('data'); if(offset<0 || wav.readUInt32LE(24)!==16000) throw Error('Expected 16 kHz WAV');
const pcm=wav.subarray(offset+8,offset+8+wav.readUInt32LE(offset+4));
const ws=new WebSocket('ws://127.0.0.1:18092/v1/realtime');
let audio=0, text='', types={}, sent=false, finished=false; const start=Date.now();
const timeout=setTimeout(()=>{console.error('Timed out');ws.terminate();process.exitCode=1;},90000);
ws.on('message',raw=>{
 const e=JSON.parse(raw); types[e.type]=(types[e.type]??0)+1;
 if(e.type==='session.created') {
   const rate=e.session?.audio?.input?.format?.rate;
   console.log(JSON.stringify({event:e.type,input_rate:rate,output_rate:e.session?.audio?.output?.format?.rate}));
   if(rate!==16000){console.error('Unsupported input sample rate'); process.exitCode=1; ws.close(); return;}
   ws.send(JSON.stringify({type:'session.update',session:{type:'realtime',instructions:'Respond in French with interleaved text and audio.',output_modalities:['text','audio']}}));
 } else if(e.type==='session.updated'&&!sent){
   sent=true;for(let i=0;i<pcm.length;i+=3200) ws.send(JSON.stringify({type:'input_audio_buffer.append',audio:pcm.subarray(i,i+3200).toString('base64')}));
   ws.send(JSON.stringify({type:'response.create'}));
 } else if(e.type==='response.output_audio.delta') audio+=Buffer.from(e.delta,'base64').length;
 else if(e.type==='response.output_text.delta' || e.type==='response.output_audio_transcript.delta') text+=e.delta;
 else if(e.type==='error'){console.log(JSON.stringify({error:e.error}));process.exitCode=1;ws.close();}
 else if(e.type==='response.done'){finished=true;console.log(JSON.stringify({elapsed_ms:Date.now()-start,audio_bytes:audio,text,status:e.response?.status,types}));ws.close();}
});
ws.on('error',e=>{console.error(e.message);process.exitCode=1;});
ws.on('close',()=>{clearTimeout(timeout);if(!finished)process.exitCode=1;});
