// Real local Pocket TTS, synthetic fixture text, no audio device.
import { formatTaskNotification } from '../prototype/task-notification.mjs';
import { streamTtsNotification } from '../prototype/tts-notification.mjs';

const text=formatTaskNotification('Le mot secret est BLUEBIRD.');
let rate=0,bytes=0,chunks=0;const started=performance.now();
await streamTtsNotification({url:'http://127.0.0.1:18081',text,signal:new AbortController().signal,
  onFormat:value=>rate=value,onAudio:chunk=>{bytes+=chunk.length;chunks++;}});
const completedMs=Math.round(performance.now()-started);
const controller=new AbortController();let interruptedBytes=0,aborted=false;
try {
  await streamTtsNotification({url:'http://127.0.0.1:18081',text,signal:controller.signal,
    onFormat(){},onAudio:chunk=>{interruptedBytes+=chunk.length;controller.abort();}});
} catch { aborted=controller.signal.aborted; }
console.log(JSON.stringify({text,rate,bytes,chunks,completedMs,interruptedBytes,aborted,physicalDevicesOpened:false}));
if(!rate||!bytes||!chunks||!aborted||!interruptedBytes)process.exitCode=1;
