// Bounded transport: fail visibly rather than allowing stale audio to accumulate.
export function createEchoBridge(worker, { maxInFlight = 5, onAudio, onError }) {
  let inFlight = 0, state = 'starting';
  const fail = message => {
    if (state === 'failed' || state === 'closed') return;
    state = 'failed';
    worker.terminate();
    onError(message);
  };
  worker.onmessage = ({ data }) => {
    if (state === 'failed' || state === 'closed') return;
    if (data.type === 'ready' && state === 'starting') state = 'ready';
    else if (data.type === 'audio' && state === 'ready' && inFlight > 0) { inFlight--; onAudio(data); }
    else if (data.type === 'error') fail(data.message);
    else fail('Unexpected echo canceller response');
  };
  worker.onerror = () => fail('Echo canceller worker failed');
  worker.postMessage({ type: 'init', sampleRate: 48000 });
  return {
    send(frame) {
      if (state !== 'ready') return false;
      if (inFlight >= maxInFlight) { fail('Echo cancellation could not keep up with live audio'); return false; }
      inFlight++;
      worker.postMessage(frame, [frame.render.buffer, frame.capture.buffer]);
      return true;
    },
    close() { if (state !== 'closed') { state = 'closed'; worker.terminate(); } },
    get state() { return state; }
  };
}
