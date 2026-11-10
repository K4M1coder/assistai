// Experimental WebRTC AEC3 worker. The caller must bound the number of in-flight frames.
let canceller = null;
let expectedSequence = 0;
let failed = false;

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      if (canceller) canceller.free();
      canceller = null;
      failed = false;
      expectedSequence = 0;
      if (data.sampleRate !== 48000) throw new Error('Echo cancellation requires a 48 kHz audio graph');
      importScripts('/aec3/webrtcaec3-0.3.0.js');
      const module = await WebRtcAec3();
      canceller = new module.AEC3(48000, 1, 1);
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'audio') {
      if (failed || !canceller) throw new Error('Echo canceller is not ready');
      if (data.sequence !== expectedSequence++) throw new Error('Echo reference frames are out of sequence');
      if (data.sampleRate !== 48000 || !(data.render instanceof Float32Array) || !(data.capture instanceof Float32Array) || data.render.length !== 480 || data.capture.length !== 480) throw new Error('Expected paired 10 ms mono audio at 48 kHz');
      canceller.analyze([data.render]);
      const output = new Float32Array(canceller.processSize([data.capture]));
      canceller.process([output], [data.capture]);
      self.postMessage({ type: 'audio', sequence: data.sequence, capture: output }, [output.buffer]);
    } else if (data.type === 'close') {
      if (canceller) canceller.free();
      canceller = null;
      self.close();
    } else throw new Error('Unknown echo canceller message');
  } catch (error) {
    failed = true;
    self.postMessage({ type: 'error', message: String(error.message || error) });
  }
};
