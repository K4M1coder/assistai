// Synthetic French voice to a strictly guarded, read-only fixture harness.
import {readFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import WebSocket from 'ws';
import {LfmRealtimeSession} from '../prototype/lfm-realtime-session.mjs';
const wav=await readFile('.cache/lfm3-fixture-french.wav');const pos=wav.indexOf('data');
if(pos<0||wav.readUInt32LE(24)!==16000)throw Error('Expected 16 kHz WAV');
const pcm=wav.subarray(pos+8,pos+8+wav.readUInt32LE(pos+4));
const tool={type:'function',name:'delegate_task',description:'Delegate a task to a background agent',parameters:{type:'object',properties:{task:{type:'string'}},required:['task']}};
const ws=new WebSocket('ws://127.0.0.1:18092/v1/realtime');
const session=new LfmRealtimeSession(ws,{instructions:'The workspace contains fixture.txt. Respond in French with function calls, and interleaved text and audio.\n\nList of tools:',tools:[tool]});
let result='',task='',text='',audio=0,nonzero=0,done=false;const headers={'content-type':'application/json'};
const timer=setTimeout(()=>{console.error('timeout');process.exitCode=1;session.close()},130000);
const json=async(path,opts={})=>{const r=await fetch(`http://127.0.0.1:18085${path}`,{...opts,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(`OpenCode HTTP ${r.status}`);return r.status===204?null:r.json()};
session.on('ready',()=>{for(let i=0;i<pcm.length;i+=3200)if(!session.appendAudio(pcm.subarray(i,i+3200)))return;session.endAudio()});
session.on('toolCall',call=>{void(async()=>{
 task=JSON.parse(call.arguments).task??'';if(call.name!=='delegate_task'||!/fixture/i.test(task)||!/secret/i.test(task))throw Error(`Unexpected task: ${task}`);
 const agent=await json('/session',{method:'POST',headers,body:JSON.stringify({title:'Adapter fixture probe'})});
 await json(`/session/${agent.id}/prompt_async`,{method:'POST',headers,body:JSON.stringify({parts:[{type:'text',text:task}]})});
 for(let i=0;i<90;i++){await sleep(1000);const status=await json('/session/status');const messages=await json(`/session/${agent.id}/message`);const last=[...messages].reverse().find(m=>m.info?.role==='assistant'&&m.info?.time?.completed);if(!status[agent.id]&&last){if(last.info.error)throw Error('Agent error');result=(last.parts??[]).filter(p=>p.type==='text').map(p=>p.text).join(' ');break;}}
 if(!/BLUEBIRD/i.test(result))throw Error(`Unexpected fixture result: ${result}`);
 if(!session.submitToolResult(call.callId,JSON.stringify({result})))throw Error('Tool result rejected');
 })().catch(e=>{console.error(e.message);process.exitCode=1;session.close()})});
session.on('text',s=>{text+=s});session.on('audio',b=>{audio+=b.length;for(let i=0;i+1<b.length;i+=2)if(b.readInt16LE(i)!==0)nonzero++});
session.on('responseDone',()=>{done=true;console.log(JSON.stringify({task,result,text,audio_bytes:audio,nonzero_samples:nonzero}));if(!/BLUEBIRD/i.test(text)||!audio||!nonzero)process.exitCode=1;session.close()});
session.on('fault',e=>{console.error(e);process.exitCode=1});session.on('closed',()=>{clearTimeout(timer);if(!done)process.exitCode=1});
