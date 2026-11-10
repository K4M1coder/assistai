import { EventEmitter } from 'node:events';
import { NativeInputFramer, nativeAudioToPcm16 } from './native-audio.mjs';

// Experimental transport adapter. Call tick once per second after ready.
// This does not implement echo cancellation, interruption or agent delegation.
export class NativeSession extends EventEmitter {
  constructor(socket, { maxSocketBytes = 256 * 1024 } = {}) {
    super();
    this.socket = socket;
    this.framer = new NativeInputFramer();
    this.maxSocketBytes = maxSocketBytes;
    this.state = 'connecting';
    this.muted = false;
    this.silence = Buffer.alloc(16000 * 4).toString('base64');
    socket.on('open', () => {
      if (this.state !== 'connecting') return;
      this.state = 'initializing';
      this.send({ type: 'session.init', payload: { mode: 'full_duplex', use_tts: true } });
    });
    socket.on('message', (data, binary) => {
      if (this.state === 'closed') return;
      if (binary) return this.fail('Unexpected binary server message');
      try { this.receive(JSON.parse(data.toString())); }
      catch { this.fail('Invalid native server message'); }
    });
    socket.on('error', () => this.fail('Native transport error'));
    socket.on('close', () => this.finish());
  }
  send(message) {
    if (this.state === 'closed') return false;
    if (this.socket.readyState !== 1 || this.socket.bufferedAmount > this.maxSocketBytes) {
      this.fail('Native transport unavailable or backpressured');
      return false;
    }
    try { this.socket.send(JSON.stringify(message)); return true; }
    catch { this.fail('Native transport send failed'); return false; }
  }
  receive(event) {
    if (event.type === 'session.created') {
      if (this.state !== 'initializing') throw new Error('Unexpected session');
      this.state = 'ready'; this.emit('ready'); return;
    }
    if (event.type === 'session.closed') { this.finish(); this.socket.close(); return; }
    if (event.type === 'response.done') { this.emit('responseDone', event.response_id ?? null); return; }
    if (event.type !== 'response.output.delta') return;
    if (event.kind === 'audio') this.emit('audio', nativeAudioToPcm16(event.audio), event.response_id ?? null);
    else if (event.kind === 'text' && typeof event.text === 'string') this.emit('text', event.text, event.response_id ?? null);
    else if (event.kind === 'listen') this.emit('listen');
  }
  push(pcm16le) {
    if (this.state !== 'ready' || this.muted) return false;
    try { this.framer.push(pcm16le); return true; }
    catch { this.fail('Invalid or excessive input audio'); return false; }
  }
  setMuted(value) { this.muted = Boolean(value); if (this.muted) this.framer.reset(); }
  tick() {
    if (this.state !== 'ready') return false;
    const frame = this.muted ? null : this.framer.take();
    if (!frame && !this.muted && this.framer.length) {
      this.framer.reset();
      this.emit('inputUnderrun');
    }
    return this.send({ type: 'input.append', input: { audio_base64: frame ?? this.silence } });
  }
  fail(reason) { if (this.state === 'closed') return; this.emit('fault', reason); this.finish(); this.socket.close(); }
  close() { if (this.state === 'closed') return; this.finish(); this.socket.close(); }
  finish() { if (this.state === 'closed') return; this.state = 'closed'; this.framer.reset(); this.emit('closed'); }
}
