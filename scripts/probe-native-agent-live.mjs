// Synthetic French audio through a temporary native gateway and read-only local harness.
import { access, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import WebSocket from 'ws';

try {
 await access('.cache/native-agent-notification.wav');
 throw Error('Preserve or move the existing notification recording before running this probe');
} catch (error) {
 if (error.code !== 'ENOENT') throw error;
}
const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const wav=await readFile('.cache/lfm3-fixture-french.wav');const pos=wav.indexOf('data');
if(pos<0||wav.readUInt32LE(24)!==16000)throw Error('Expected 16 kHz PCM WAV');
const pcm=wav.subarray(pos+8,pos+8+wav.readUInt32LE(pos+4));
const env={...process.env,ASSISTAI_GATEWAY_PORT:String(port),ASSISTAI_DB_PATH:':memory:',
 ASSISTAI_LFM_REALTIME_URL:'ws://127.0.0.1:18210/v1/realtime',ASSISTAI_LFM_TRANSCRIPT_ASR_URL:'ws://127.0.0.1:18082/asr',
 ASSISTAI_OPENCODE_URL:'http://127.0.0.1:18085',ASSISTAI_LFM_WORKSPACE_CONTEXT:'The read-only fixture contains fixture.txt.',
 ASSISTAI_BUDGET_SAMPLE_PATH:'.cache/assistant/demo-18131-resource.json',ASSISTAI_RESOURCE_STATUS_PATH:'.cache/assistant/demo-18131-resource.json',
 ASSISTAI_SHARED_RESERVATIONS_PATH:'.cache/assistant/task-reservations.sqlite',ASSISTAI_BUDGET_BASELINE_SHARED_BYTES:'0',
 ASSISTAI_TASK_VRAM_ESTIMATE_BYTES:String(512*1024**2),ASSISTAI_TASK_RAM_ESTIMATE_BYTES:String(3*1024**3)};
const child=spawn(process.execPath,['prototype/gateway.mjs'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let stderr='';child.stderr.on('data',data=>stderr+=data);let socket;
try {
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Gateway startup timeout: ${stderr}`)),10000);
  child.once('exit',code=>{clearTimeout(timer);reject(Error(`Gateway exited ${code}: ${stderr}`))});
  child.stdout.on('data',data=>{if(data.toString().includes('Experimental voice gateway')){clearTimeout(timer);resolve()}})});
 socket=new WebSocket(`ws://127.0.0.1:${port}/voice`);let result={started:false,completed:false,initialAudio:0,notificationAudio:0,transcript:'',task:'',result:'',assistant:'',notificationText:'',error:null};const notificationChunks=[];
 let initialEnded=false,notificationStarted=false,notificationRequested=false,audioSent=false,taskId=null;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{result.error='Native agent test timed out; task may still be running';resolve();},55000);
  const notify=()=>{if(initialEnded&&taskId&&!notificationRequested){notificationRequested=true;socket.send(JSON.stringify({type:'notification.speak',task_id:taskId}));}};
  socket.on('error',reject);
  socket.on('message',async(data,binary)=>{
   if(binary){if(notificationStarted){result.notificationAudio+=data.length;if(result.notificationAudio>4*1024*1024){clearTimeout(timer);reject(Error('Notification audio exceeds limit'));return;}notificationChunks.push(Buffer.from(data));}else result.initialAudio+=data.length;return;}
   const e=JSON.parse(data);
   if(e.type==='asr.ready'&&!audioSent){audioSent=true;socket.send(JSON.stringify({type:'audio.start'}));for(let i=0;i<pcm.length;i+=3200){socket.send(pcm.subarray(i,i+3200));await new Promise(r=>setTimeout(r,100));}socket.send(JSON.stringify({type:'audio.end'}));}
   else if(e.type==='user.text')result.transcript=e.text;
   else if(e.type==='assistant.text'){if(notificationStarted)result.notificationText+=e.text;else result.assistant+=e.text;}
   else if(e.type==='task.started'){result.started=true;result.task=e.task;}
   else if(e.type==='task.completed'){result.completed=true;result.result=e.text;taskId=e.task_id;notify();}
   else if(e.type==='notification.started')notificationStarted=true;
   else if(e.type==='speech.end'){if(notificationStarted){clearTimeout(timer);resolve();}else{initialEnded=true;notify();}}
   else if(['error','task.error','task.rejected','task.uncertain','notification.rejected'].includes(e.type)){result.error=e.message??e.reason??e.type;clearTimeout(timer);resolve();}
  });
 });
 if(result.notificationAudio){
  const header=Buffer.alloc(44);header.write('RIFF',0);header.writeUInt32LE(36+result.notificationAudio,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(result.notificationAudio,40);
  await writeFile('.cache/native-agent-notification.wav',Buffer.concat([header,...notificationChunks]),{flag:'wx'});result.notificationFile='.cache/native-agent-notification.wav';
 }
 console.log(JSON.stringify({...result,physicalDevicesOpened:false},null,2));
 if(!result.started||!result.completed||!result.notificationAudio||result.error||
    !/fixture\.txt/i.test(result.task)||!/\bBLUEBIRD\b/i.test(result.result)||
    !/\bBLUEBIRD\b/i.test(result.notificationText))process.exitCode=1;
} finally {
 socket?.terminate();child.kill();await Promise.race([once(child,'exit').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);
}
