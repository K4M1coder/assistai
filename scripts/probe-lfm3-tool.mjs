// Synthetic tool-call probe: no tool is executed and no device settings change.
import {readFile} from 'node:fs/promises';import WebSocket from 'ws';
const wav=await readFile('.cache/lfm3-tool-synthetic.wav');const p=wav.indexOf('data');const pcm=wav.subarray(p+8,p+8+wav.readUInt32LE(p+4));
const ws=new WebSocket('ws://127.0.0.1:18092/v1/realtime');let sent=false,done=false;
const timer=setTimeout(()=>{console.error('timeout');process.exitCode=1;ws.terminate()},60000);
ws.on('message',raw=>{const e=JSON.parse(raw);
 if(e.type==='session.created')ws.send(JSON.stringify({type:'session.update',session:{type:'realtime',instructions:'Respond with function calls, and interleaved text and audio.\n\nList of tools:',tools:[{type:'function',name:'set_volume',description:'Set speaker volume',parameters:{type:'object',properties:{volume:{type:'integer'}},required:['volume']}}]}}));
 else if(e.type==='session.updated'&&!sent){sent=true;for(let i=0;i<pcm.length;i+=3200)ws.send(JSON.stringify({type:'input_audio_buffer.append',audio:pcm.subarray(i,i+3200).toString('base64')}));ws.send(JSON.stringify({type:'response.create'}));}
 else if(e.type==='response.done'){done=true;const calls=(e.response?.output??[]).filter(x=>x.type==='function_call').map(x=>({name:x.name,arguments:x.arguments}));console.log(JSON.stringify({status:e.response?.status,calls}));if(!calls.some(x=>x.name==='set_volume'&&JSON.parse(x.arguments).volume===30))process.exitCode=1;ws.close();}
 else if(e.type==='error'){console.log(JSON.stringify({error:e.error}));process.exitCode=1;ws.close();}});
ws.on('error',e=>{console.error(e.message);process.exitCode=1});ws.on('close',()=>{clearTimeout(timer);if(!done)process.exitCode=1});
