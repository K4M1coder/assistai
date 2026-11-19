// Public-site probe through the direct-delegation gateway and web fixture.
import WebSocket from 'ws';

const search = process.argv.includes('--search');
const target = process.argv.includes('--official') ? 'https://metropole.nantes.fr/' : 'https://www.nantes.fr/';
const request = search ? 'Recherche sur internet le site officiel de Nantes et donne son adresse avec une source.'
  : `Visite ${target} avec webfetch et indique le titre de la page et son adresse.`;
const socket = new WebSocket('ws://127.0.0.1:18121/voice');
let sent=false, started=null, completed=null, initialEnd=false, notification=false, notificationBytes=0, failure=null;
const timer=setTimeout(()=>{failure='Timed out; task may still be running';socket.terminate();},150000);
const finished = new Promise((resolve,reject)=>{
  socket.on('error',reject);
  socket.on('close',resolve);
  socket.on('message',async(raw,binary)=>{
    if(binary){if(notification)notificationBytes+=raw.length;return;}
    const event=JSON.parse(raw);
    if(event.type==='asr.ready'&&!sent){sent=true;socket.send(JSON.stringify({type:'text',text:request}));}
    else if(event.type==='task.started')started=event;
    else if(event.type==='task.completed'){completed=event;if(initialEnd)socket.send(JSON.stringify({type:'notification.speak',task_id:event.task_id}));}
    else if(event.type==='notification.started')notification=true;
    else if(event.type==='speech.end'){
      if(notification){clearTimeout(timer);socket.close();}
      else {initialEnd=true;if(completed)socket.send(JSON.stringify({type:'notification.speak',task_id:completed.task_id}));}
    } else if(['task.error','task.rejected','task.uncertain','notification.rejected','error'].includes(event.type)){
      failure=`${event.type}: ${event.message ?? event.reason ?? ''}`;clearTimeout(timer);socket.close();
    }
  });
});
try { await finished; } finally { clearTimeout(timer); }
let webfetch=[], websearch=[], tools=[];
if(started?.task_id){
  const response=await fetch(`http://127.0.0.1:18120/session/${encodeURIComponent(started.task_id)}/message`,{signal:AbortSignal.timeout(5000)});
  if(response.ok){
    const messages=await response.json();
    const parts=messages.flatMap(message=>message.parts??[]).filter(part=>part.type==='tool');
    tools=parts.map(part=>({name:part.tool,status:part.state?.status}));
    webfetch=parts.filter(part=>part.tool==='webfetch')
      .map(part=>({status:part.state?.status,url:part.state?.input?.url,output_excerpt:String(part.state?.output??'').slice(0,300),error:part.state?.error??null}));
    websearch=parts.filter(part=>part.tool==='websearch')
      .map(part=>({status:part.state?.status,query:part.state?.input?.query,output_excerpt:String(part.state?.output??'').slice(0,300),error:part.state?.error??null}));
  }
}
console.log(JSON.stringify({request,started:Boolean(started),taskId:started?.task_id??null,task:started?.task??null,completed:Boolean(completed),
  result:completed?.text??null,notificationBytes,tools,webfetch,websearch,failure,physicalDevicesOpened:false},null,2));
const retrieved=search ? websearch.some(item=>item.status==='completed') : webfetch.some(item=>item.status==='completed'&&item.url===target);
const hasSource=search ? /https?:\/\//i.test(completed?.text??'') : completed?.text?.includes(target);
if(!started||!completed||failure||!notificationBytes||!hasSource||!/nantes/i.test(completed.text)||!retrieved)process.exitCode=1;
