// Synthetic read-only fixture integration. Only the expected local fixture task is sent to OpenCode.
import {readFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import WebSocket from 'ws';
const wav=await readFile('.cache/lfm3-fixture-french.wav');const pos=wav.indexOf('data');
if(pos<0||wav.readUInt32LE(24)!==16000)throw Error('Expected 16 kHz WAV');
const pcm=wav.subarray(pos+8,pos+8+wav.readUInt32LE(pos+4));
const forceAudio=process.env.ASSISTAI_FORCE_AUDIO==='1';
const frenchReport=process.env.ASSISTAI_FRENCH_REPORT==='1';
const ws=new WebSocket('ws://127.0.0.1:18092/v1/realtime');
let sent=false, phase='initial', toolTask='', result='', voiceBytes=0, nonzeroSamples=0, responseText='', done=false;
const timer=setTimeout(()=>{console.error('timeout');process.exitCode=1;ws.terminate()},140000);
const json=async(path,options={})=>{const r=await fetch(`http://127.0.0.1:18085${path}`,{...options,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(`OpenCode HTTP ${r.status}`);return r.status===204?null:r.json()};
const headers={'content-type':'application/json'};
async function delegate(call) {
 const args=JSON.parse(call.arguments);toolTask=args.task??'';
 // Restrict the experiment to its disposable read-only fixture and intended secret-word query.
 if(!/fixture/i.test(toolTask)||!/secret/i.test(toolTask))throw Error(`Unexpected task: ${toolTask}`);
 const agent=await json('/session',{method:'POST',headers,body:JSON.stringify({title:'Synthetic voice fixture probe'})});
 await json(`/session/${agent.id}/prompt_async`,{method:'POST',headers,body:JSON.stringify({parts:[{type:'text',text:toolTask}]})});
 for(let i=0;i<90;i++){
  await sleep(1000);const status=await json('/session/status');const messages=await json(`/session/${agent.id}/message`);
  const last=[...messages].reverse().find(m=>m.info?.role==='assistant'&&m.info?.time?.completed);
  if(!status[agent.id]&&last){if(last.info.error)throw Error('Agent error');result=(last.parts??[]).filter(p=>p.type==='text').map(p=>p.text).join(' ');break;}
 }
 if(!/BLUEBIRD/i.test(result))throw Error(`Unexpected fixture result: ${result}`);
 ws.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify({result})}}));
 phase='continuation';voiceBytes=0;nonzeroSamples=0;responseText='';ws.send(JSON.stringify({type:'response.create',response:{output_modalities:['text','audio']}}));
}
ws.on('message',raw=>{const e=JSON.parse(raw);
 if(e.type==='session.created')ws.send(JSON.stringify({type:'session.update',session:{type:'realtime',...(forceAudio?{output_modalities:['text','audio']} : {}),instructions:`The workspace contains fixture.txt. Respond ${frenchReport ? 'in French ' : ''}with function calls, and interleaved text and audio.\n\nList of tools:`,tools:[{type:'function',name:'delegate_task',description:'Delegate a task to a background agent',parameters:{type:'object',properties:{task:{type:'string'}},required:['task']}}]}}));
 else if(e.type==='session.updated'&&!sent){sent=true;for(let i=0;i<pcm.length;i+=3200)ws.send(JSON.stringify({type:'input_audio_buffer.append',audio:pcm.subarray(i,i+3200).toString('base64')}));ws.send(JSON.stringify({type:'response.create'}));}
 else if(e.type==='response.output_audio.delta'){const samples=Buffer.from(e.delta,'base64');voiceBytes+=samples.length;for(let i=0;i+1<samples.length;i+=2)if(samples.readInt16LE(i)!==0)nonzeroSamples++;}
 else if(e.type==='response.output_text.delta')responseText+=e.delta;
 else if(e.type==='response.done'&&phase==='initial'){
  const calls=(e.response?.output??[]).filter(x=>x.type==='function_call'&&x.name==='delegate_task');phase='waiting';
  if(calls.length!==1){console.error(JSON.stringify({error:'Expected exactly one call',calls}));process.exitCode=1;ws.close();return;}
  delegate(calls[0]).catch(err=>{console.error(err.message);process.exitCode=1;ws.close()});
 } else if(e.type==='response.done'&&phase==='continuation'){
  done=true;console.log(JSON.stringify({toolTask,result,continuation:responseText,audio_bytes:voiceBytes,nonzero_samples:nonzeroSamples,status:e.response?.status}));if(!/BLUEBIRD/i.test(responseText)||voiceBytes===0||nonzeroSamples===0)process.exitCode=1;ws.close();
 }else if(e.type==='error'){console.error(JSON.stringify({error:e.error}));process.exitCode=1;ws.close();}
});
ws.on('error',e=>{console.error(e.message);process.exitCode=1});ws.on('close',()=>{clearTimeout(timer);if(!done)process.exitCode=1});
