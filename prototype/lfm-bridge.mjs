import WebSocket from 'ws';
import { LfmRealtimeSession } from './lfm-realtime-session.mjs';
import { createNativeTranscript } from './native-transcript.mjs';

// Opt-in research bridge. It does not provide OS isolation or a memory limit.
export function attachLfmBridge(client, { url, launchTask, makeTurnId, sessionFactory, workspaceContext = '', canNotify = () => false, transcriptUrl } = {}) {
  const send = event => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(event)); };
  const transcript = transcriptUrl ? createNativeTranscript({ url: transcriptUrl, send }) : null;
  const createSession = sessionFactory ?? (() => new LfmRealtimeSession(new WebSocket(url), {
    instructions: `${workspaceContext ? `Workspace context: ${workspaceContext}\n` : ''}Respond in French with function calls, and interleaved text and audio. Do not claim a task is complete until its result is known.\n\nList of tools:`,
    tools: [{ type:'function', name:'delegate_task', description:'Delegate a substantive task to a background agent', parameters:{type:'object',properties:{task:{type:'string'}},required:['task']} }],
  }));
  let current, listening=false, ended=false, queued=[], queuedBytes=0, turnId=null, speech=false, text='';
  const clearQueued = () => { queued=[]; queuedBytes=0; ended=false; };
  const finishSpeech = () => { if (speech) { speech=false; send({type:'speech.end',turn_id:turnId}); } };
  const fail = message => { listening=false; clearQueued(); send({type:'error',message}); };
  const makeSession = () => {
    const session=createSession(); current=session;
    session.on('ready',()=>{ if(current===session) send({type:'asr.ready'}); });
    session.on('responseStart',()=>{ if(current===session){text='';speech=false;} });
    session.on('text',value=>{if(current===session)text+=value;});
    session.on('audio',pcm=>{
      if(current!==session || client.readyState!==WebSocket.OPEN)return;
      if(client.bufferedAmount>1024*1024){fail('Audio output backpressure');session.close();return;}
      if(!speech){speech=true;send({type:'speech.start',turn_id:turnId,sample_rate:24000,encoding:'pcm_s16le'});}
      client.send(pcm,{binary:true});
    });
    session.on('responseDone',()=>{if(current!==session)return;if(text)send({type:'assistant.text',turn_id:turnId,text});if(speech)finishSpeech();else send({type:'speech.end',turn_id:turnId});});
    session.on('cancelled',()=>{
      if(current!==session)return;
      const frames=queued;const shouldEnd=ended;clearQueued();
      for(const frame of frames)if(!session.appendAudio(frame))return;
      if(shouldEnd&&frames.length){listening=false;session.endAudio();}
    });
    session.on('toolCall',call=>{
      if(current!==session)return;finishSpeech();
      void (async()=>{
        let result;
        try {
          if(call.name!=='delegate_task')throw Error('Unknown tool');
          const args=JSON.parse(call.arguments);
          if(typeof args.task!=='string'||!args.task.trim()||args.task.length>4000)throw Error('Invalid task');
          const launched=await launchTask(args.task,turnId);
          result={accepted:Boolean(launched.accepted), ...(launched.already_running ? {already_running:true} : {})};
        } catch(error){result={accepted:false,error:String(error)};}
        if(current===session)session.submitToolResult(call.callId,JSON.stringify(result));
      })();
    });
    session.on('fault',message=>{if(current===session)fail(message);});
    session.on('closed',()=>{if(current===session){listening=false;clearQueued();}});
  };
  makeSession();
  client.on('message',(data,binary)=>{
    if(binary){
      if(!listening)return;
      const frame=Buffer.from(data);
      transcript?.append(frame);
      if(['cancelling','cancel_on_create'].includes(current.state)){
        if(queuedBytes+frame.length>32000){fail('Interrupted input buffer full');return;}
        queued.push(frame);queuedBytes+=frame.length;return;
      }
      if(!current.appendAudio(frame))fail('Realtime session is busy or unavailable');
      return;
    }
    let event;try{event=JSON.parse(data.toString());}catch{return;}
    if(event.type==='interrupt'){
      listening=false;clearQueued();transcript?.stop();
      if(current.cancel()){speech=false;send({type:'speech.cancelled',turn_id:turnId,reason:event.reason??'manual'});}
    }else if(event.type==='audio.start'){
      if(!['ready','cancelling','cancel_on_create'].includes(current.state)){fail('Realtime session is busy');return;}
      turnId=makeTurnId();listening=true;clearQueued();transcript?.start(turnId);
    }else if(event.type==='audio.end'&&listening){
      transcript?.end();
      if(['cancelling','cancel_on_create'].includes(current.state)){ended=true;return;}
      listening=false;if(!current.endAudio())fail('No speech was captured');
    }else if(event.type==='audio.reset'){
      if(listening)transcript?.stop();listening=false;clearQueued();
      // The server may already have prefetched input; a fresh session discards it.
      if(current.state==='collecting'){const old=current;current=null;old.close();makeSession();}
    }else if(event.type==='notification.speak'){
      if(listening || !canNotify(event.task_id) || current.state!=='ready'){send({type:'notification.rejected',task_id:event.task_id});return;}
      turnId=makeTurnId();
      if(current.speakText('La tache en arriere-plan est terminee. Le resultat est affiche.')) send({type:'notification.started',task_id:event.task_id,turn_id:turnId});
      else send({type:'notification.rejected',task_id:event.task_id});
    }
    else if(event.type==='text'||event.type==='image')send({type:'error',message:'Text and image input are not available in the experimental speech mode.'});
  });
  client.on('close',()=>{transcript?.stop();const old=current;current=null;old?.close();});
}
