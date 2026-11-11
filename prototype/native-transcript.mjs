import WebSocket from 'ws';

// One isolated ASR connection per turn prevents late text leaking into a new turn.
export function createNativeTranscript({ url, send, socketFactory = address => new WebSocket(address) }) {
  let active;
  const stop = () => { const old = active; active = null; if (old) { clearTimeout(old.timer); old.socket.close(); } };
  const start = turnId => {
    stop();
    const state = { turnId, socket: socketFactory(url), frames: [], bytes: 0, ended: false, segments: [], ready: false };
    active = state;
    const fail = () => { if (active !== state) return; send({ type: 'transcript.unavailable', turn_id: turnId }); stop(); };
    state.timer = setTimeout(fail, 30000);
    state.socket.on('error', fail);
    state.socket.on('close', () => { if (active === state) fail(); });
    state.socket.on('message', raw => {
      if (active !== state) return;
      let event; try { event = JSON.parse(raw.toString()); } catch { fail(); return; }
      if (event.type === 'ready') {
        state.ready = true;
        for (const frame of state.frames) state.socket.send(frame, { binary: true });
        state.frames = []; state.bytes = 0;
        if (state.ended) state.socket.send(JSON.stringify({ type: 'end' }));
      } else if (event.type === 'partial') send({ type: 'asr.partial', turn_id: turnId, text: event.text ?? '' });
      else if (event.type === 'segment' && event.text) state.segments.push(event.text);
      else if (event.type === 'final') {
        const text = [...state.segments, event.text].filter(Boolean).join(' ').trim();
        if (text) send({ type: 'user.text', turn_id: turnId, text, source: 'parallel-asr' });
        else send({ type: 'transcript.empty', turn_id: turnId });
        stop();
      }
    });
  };
  const append = frame => {
    if (!active || active.ended) return;
    if (active.ready) {
      if (active.socket.bufferedAmount > 32000) { send({ type: 'transcript.unavailable', turn_id: active.turnId }); stop(); return; }
      active.socket.send(frame, { binary: true });
    } else {
      if (active.bytes + frame.length > 32000) { send({ type: 'transcript.unavailable', turn_id: active.turnId }); stop(); return; }
      active.frames.push(Buffer.from(frame)); active.bytes += frame.length;
    }
  };
  const end = () => { if (!active) return; active.ended = true; if (active.ready) active.socket.send(JSON.stringify({ type: 'end' })); };
  return { start, append, end, stop };
}
