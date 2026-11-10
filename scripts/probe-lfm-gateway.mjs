// Synthetic client to the opt-in gateway; the configured harness is a read-only fixture.
import {readFile} from 'node:fs/promises';
import WebSocket from 'ws';
const wav=await readFile('.cache/lfm3-fixture-french.wav');const p=wav.indexOf('data');if(p<0||wav.readUInt32LE(24)!==16000)throw Error('Expected 16 kHz WAV');
const pcm=wav.subarray(p+8,p+8+wav.readUInt32LE(p+4));
const ws=new WebSocket('ws://127.0.0.1:18093/voice');let ready=false,started=false,completed=false,audio=0,nonzero=0,speech=false,text='',failure=null,taskId=null,initialEnded=false,notificationStarted=false,notificationBytes=0;
const timer=setTimeout(()=>{failure='timeout';ws.close()},120000);
ws.on('message',async(data,binary)=>{
 if(binary){audio+=data.length;if(notificationStarted)notificationBytes+=data.length;for(let i=0;i+1<data.length;i+=2)if(data.readInt16LE(i)!==0)nonzero++;return;}
 const e=JSON.parse(data);
 if(e.type==='asr.ready'&&!ready){ready=true;ws.send(JSON.stringify({type:'audio.start'}));for(let i=0;i<pcm.length;i+=3200){ws.send(pcm.subarray(i,i+3200),{binary:true});await new Promise(r=>setTimeout(r,100));}ws.send(JSON.stringify({type:'audio.end'}));}
 else if(e.type==='task.started'){started=true;if(!/fixture/i.test(e.task)||!/secret/i.test(e.task)){failure=`Unexpected task: ${e.task}`;ws.close();}}
 else if(e.type==='task.completed'){completed=/BLUEBIRD/i.test(e.text);taskId=e.task_id;if(!completed){failure='Unexpected fixture result';ws.close();}else if(initialEnded)ws.send(JSON.stringify({type:'notification.speak',task_id:taskId}));}
 else if(e.type==='speech.start')speech=true;
 else if(e.type==='notification.started')notificationStarted=true;
 else if(e.type==='notification.rejected'){failure='Notification rejected';ws.close();}
 else if(e.type==='speech.end'){if(notificationStarted){if(notificationBytes>0)ws.close();else {failure='Notification contained no audio';ws.close();}}else{initialEnded=true;if(completed)ws.send(JSON.stringify({type:'notification.speak',task_id:taskId}));}}
 else if(e.type==='assistant.text')text+=e.text;
 else if(e.type==='error'||e.type==='task.error'){failure=e.message;ws.close();}

});
ws.on('error',e=>{failure=e.message});
ws.on('close',()=>{clearTimeout(timer);console.log(JSON.stringify({ready,started,completed,speech,audio_bytes:audio,nonzero_samples:nonzero,text,notificationStarted,notificationBytes,failure}));if(!ready||!started||!completed||!speech||!audio||!nonzero||!notificationStarted||!notificationBytes||failure)process.exitCode=1});
