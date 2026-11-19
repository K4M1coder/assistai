// Real browser and native model; synthetic, muted audio; no physical microphone input.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import WebSocket from 'ws';
import { followupAnswer, followupTranscript, plausibleFollowupTranscript, correctFollowup } from '../prototype/native-barge-assertions.mjs';

const different=process.argv.includes('--different-followup');
const windowsFollowup=process.argv.includes('--windows-followup');
const captureArg=process.argv.find(arg=>arg.startsWith('--capture-run-id='));
const captureId=captureArg?.slice('--capture-run-id='.length);
if(captureArg&&!/^[A-Za-z0-9_-]{1,40}$/.test(captureId))throw Error('Invalid capture run ID');
if(captureId){for(const extension of ['wav','json']){
 try{await access(`.cache/native-barge-${captureId}.${extension}`);throw Error('Capture already exists');}
 catch(error){if(error.code!=='ENOENT')throw error;}
}}
if(windowsFollowup&&!different)throw Error('Windows follow-up requires --different-followup');
async function readPhrase(filename){const input=await readFile(filename);const offset=input.indexOf('data');
 if(offset<0||input.readUInt16LE(22)!==1||input.readUInt32LE(24)!==16000||input.readUInt16LE(34)!==16)throw Error('Expected mono 16 kHz PCM16');
 return input.subarray(offset+8,offset+8+input.readUInt32LE(offset+4));}
const phrase=await readPhrase('.cache/kyutai-persistent-synthetic-capital.wav');
const followup=different?await readPhrase(windowsFollowup?'.cache/lfm3-math-windows.wav':'.cache/kyutai-persistent-synthetic-math.wav'):phrase;
const pcm=Buffer.concat([Buffer.alloc(3*32000),phrase,followup,Buffer.alloc(4*32000)]);
const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(16000,24);header.writeUInt32LE(32000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
const profile=await mkdtemp(path.join(tmpdir(),'assistai-barge-in-'));const audio=path.join(profile,'synthetic.wav');await writeFile(audio,Buffer.concat([header,pcm]),{flag:'wx'});
const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const env={...process.env,ASSISTAI_GATEWAY_PORT:String(port),ASSISTAI_DB_PATH:':memory:',ASSISTAI_LFM_REALTIME_URL:'ws://127.0.0.1:18210/v1/realtime',
 ASSISTAI_LFM_TRANSCRIPT_ASR_URL:'ws://127.0.0.1:18082/asr',ASSISTAI_LFM_NOTIFICATION_TTS:'',ASSISTAI_OPENCODE_URL:'',
 ASSISTAI_BUDGET_SAMPLE_PATH:'',ASSISTAI_RESOURCE_STATUS_PATH:'',ASSISTAI_SHARED_RESERVATIONS_PATH:''};
const gateway=spawn(process.execPath,['prototype/gateway.mjs'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});let stderr='',browser,socket;
gateway.stderr.on('data',chunk=>stderr+=chunk);
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Gateway startup timeout: ${stderr}`)),10000);gateway.once('exit',code=>{clearTimeout(timer);reject(Error(`Gateway exited ${code}: ${stderr}`));});gateway.stdout.on('data',chunk=>{if(chunk.toString().includes('Experimental voice gateway')){clearTimeout(timer);resolve();}});});
 const chrome=process.env.ASSISTAI_CHROME??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 browser=spawn(chrome,['--headless','--disable-gpu','--mute-audio','--disable-background-networking','--no-first-run','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${audio}%noloop`,`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:'ignore'});
 let debugPort;for(let i=0;i<100;i++){try{debugPort=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
 if(!debugPort)throw Error('Browser startup timeout');
 const target=await(await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${port}/`)}`,{method:'PUT'})).json();
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 let id=0;const pending=new Map();socket.on('message',raw=>{const result=JSON.parse(raw);if(!pending.has(result.id))return;const {resolve,reject}=pending.get(result.id);pending.delete(result.id);if(result.error)reject(Error(result.error.message));else resolve(result.result);});
 const evaluate=expression=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});socket.send(JSON.stringify({id:request,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));}).then(result=>{if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;});
 let ready=false;for(let i=0;i<100;i++){ready=await evaluate("document.querySelector('#mode')?.textContent.includes('native speech') && document.querySelector('#status')?.textContent.includes('Ready.')");if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}if(!ready)throw Error('Native client not ready');
 await evaluate(`window.__before=0;window.__after=0;window.__afterChunks=[];window.__afterCount=0;window.__afterOverflow=false;const original=AudioContext.prototype.createBuffer;
   AudioContext.prototype.createBuffer=function(channels,length,rate){if(channels===1&&rate===24000){if(document.querySelector('#log').textContent.includes('Playback interrupted: microphone detected speech.'))window.__after+=length*2;else window.__before+=length*2;}return original.call(this,channels,length,rate);};
   const originalStart=AudioBufferSourceNode.prototype.start;
   AudioBufferSourceNode.prototype.start=function(...args){if(${Boolean(captureId)}&&this.buffer?.numberOfChannels===1&&this.buffer.sampleRate===24000&&document.querySelector('#log').textContent.includes('Playback interrupted: microphone detected speech.')){const data=this.buffer.getChannelData(0);window.__afterCount+=data.length;if(window.__afterCount>2000000)window.__afterOverflow=true;else window.__afterChunks.push(Array.from(data));}return originalStart.apply(this,args);};
   document.querySelector('#speaker-safe').checked=false;document.querySelector('#start').click();true`);
 let state={};
 for(let i=0;i<500;i++){
   state=await evaluate("({status:document.querySelector('#status').textContent,log:document.querySelector('#log').textContent,before:window.__before,after:window.__after})");
   if(state.status.includes('Microphone unavailable'))throw Error(state.status);
   if((state.log.match(/You:/g)||[]).length>=2&&plausibleFollowupTranscript(followupTranscript(state.log),different)&&correctFollowup(followupAnswer(state.log),different)&&state.after>0)break;
   await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(captureId){
   await new Promise(resolve=>setTimeout(resolve,5000));
   const chunks=await evaluate("(() => { if(window.__afterOverflow) throw Error('Captured audio exceeds limit'); return window.__afterChunks; })()");
   const samples=chunks.flat();if(!samples.length)throw Error('No post-interruption audio captured');
   const output=Buffer.alloc(44+samples.length*2);output.write('RIFF');output.writeUInt32LE(36+samples.length*2,4);output.write('WAVEfmt ',8);output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(1,22);output.writeUInt32LE(24000,24);output.writeUInt32LE(48000,28);output.writeUInt16LE(2,32);output.writeUInt16LE(16,34);output.write('data',36);output.writeUInt32LE(samples.length*2,40);
   for(let i=0;i<samples.length;i++)output.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(samples[i]*32767))),44+i*2);
   await writeFile(`.cache/native-barge-${captureId}.wav`,output,{flag:'wx'});
   await writeFile(`.cache/native-barge-${captureId}.json`,JSON.stringify({followupAnswer:followupAnswer(state.log),differentFollowup:different,windowsFollowup},null,2),{flag:'wx'});
 }
 await evaluate("document.querySelector('#stop').click();true");
 const interruption=state.log.includes('Playback interrupted: microphone detected speech.');const transcripts=(state.log.match(/You:/g)||[]).length;
 const answer=followupAnswer(state.log),correct=correctFollowup(answer,different),transcript=followupTranscript(state.log),transcriptPlausible=plausibleFollowupTranscript(transcript,different);
 console.log(JSON.stringify({...state,interruption,transcripts,differentFollowup:different,windowsFollowup,followupTranscript:transcript,transcriptPlausible,followupAnswer:answer,followupCorrect:correct,microphoneSource:'Chromium fake WAV device',browserAudioMuted:true,profile},null,2));
 if(!interruption||transcripts<2||!state.before||!state.after||!correct||!transcriptPlausible)process.exitCode=1;
}finally{socket?.close();browser?.kill();gateway.kill();await Promise.race([once(gateway,'exit').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);}
