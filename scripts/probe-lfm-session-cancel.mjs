// Synthetic input only; verify cancellation through the experimental session adapter.
import {readFile} from 'node:fs/promises';
import WebSocket from 'ws';
import {LfmRealtimeSession} from '../prototype/lfm-realtime-session.mjs';
const wav=await readFile('.cache/omni-english/utterance.wav');const pos=wav.indexOf('data');
if(pos<0||wav.readUInt32LE(24)!==16000)throw Error('Expected 16 kHz WAV');
const pcm=wav.subarray(pos+8,pos+8+wav.readUInt32LE(pos+4));
const ws=new WebSocket('ws://127.0.0.1:18092/v1/realtime');
const session=new LfmRealtimeSession(ws,{instructions:'Respond with interleaved text and audio.'});
let audioBytes=0,cancelled=false,start=0;
const timeout=setTimeout(()=>{console.error('timeout');process.exitCode=1;session.close()},60000);
session.on('ready',()=>{for(let i=0;i<pcm.length;i+=3200)if(!session.appendAudio(pcm.subarray(i,i+3200)))return;session.endAudio();});
session.on('audio',b=>{audioBytes+=b.length;if(!start){start=Date.now();session.cancel();}});
session.on('cancelled',()=>{cancelled=true;console.log(JSON.stringify({cancelled,audio_bytes_before_cancel:audioBytes,completion_ms:Date.now()-start}));session.close();});
session.on('fault',reason=>{console.error(reason);process.exitCode=1});
session.on('closed',()=>{clearTimeout(timeout);if(!cancelled||!audioBytes)process.exitCode=1});
