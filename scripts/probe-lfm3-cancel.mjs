// Synthetic cancellation probe; no microphone is used.
import {readFile} from 'node:fs/promises';
import WebSocket from 'ws';
const wav=await readFile('.cache/omni-english/utterance.wav');const pos=wav.indexOf('data');
if(pos<0||wav.readUInt32LE(24)!==16000)throw Error('Expected 16 kHz WAV');
const pcm=wav.subarray(pos+8,pos+8+wav.readUInt32LE(pos+4));
const ws=new WebSocket('ws://127.0.0.1:18092/v1/realtime');let sent=false,cancelAt=0,done=false,before=0,after=0,text='';
const deadline=setTimeout(()=>{console.error('timeout');process.exitCode=1;ws.terminate()},60000);
ws.on('message',raw=>{const e=JSON.parse(raw);
 if(e.type==='session.created')ws.send(JSON.stringify({type:'session.update',session:{type:'realtime',instructions:'Respond with interleaved text and audio.'}}));
 else if(e.type==='session.updated'&&!sent){sent=true;for(let i=0;i<pcm.length;i+=3200)ws.send(JSON.stringify({type:'input_audio_buffer.append',audio:pcm.subarray(i,i+3200).toString('base64')}));ws.send(JSON.stringify({type:'response.create',response:{output_modalities:['text','audio']}}));}
 else if(e.type==='response.output_text.delta')text+=e.delta;
 else if(e.type==='response.output_audio.delta'){
  const size=Buffer.from(e.delta,'base64').length;
  if(!cancelAt){before+=size;cancelAt=Date.now();ws.send(JSON.stringify({type:'response.cancel'}));}else after+=size;
 } else if(e.type==='response.done'){
  done=true;console.log(JSON.stringify({status:e.response?.status,cancel_sent:!!cancelAt,completion_ms_after_cancel:cancelAt?Date.now()-cancelAt:null,before_bytes:before,after_bytes:after,text}));
  if(!cancelAt||e.response?.status!=='cancelled')process.exitCode=1;ws.close();
 }else if(e.type==='error'){console.error(JSON.stringify({error:e.error}));process.exitCode=1;ws.close();}
});
ws.on('error',e=>{console.error(e.message);process.exitCode=1});ws.on('close',()=>{clearTimeout(deadline);if(!done)process.exitCode=1});
