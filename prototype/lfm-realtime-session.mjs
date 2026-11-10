import { EventEmitter } from 'node:events';

// Experimental LFM3 /v1/realtime adapter. The caller owns the socket and all tools.
// Input is mono PCM16LE at 16 kHz; output is PCM16LE at 24 kHz.
export class LfmRealtimeSession extends EventEmitter {
  constructor(socket, { instructions, tools = [], maxInputBytes = 960000, maxSocketBytes = 262144 } = {}) {
    super();
    if (typeof instructions !== 'string' || !instructions || !Array.isArray(tools)) throw new TypeError('Session configuration required');
    this.socket = socket; this.instructions = instructions; this.tools = tools;
    this.maxInputBytes = maxInputBytes; this.maxSocketBytes = maxSocketBytes;
    this.state = 'connecting'; this.responseId = null; this.inputBytes = 0; this.pendingCall = null;
    socket.on('message', (data, binary) => {
      if (this.state === 'closed') return;
      if (binary) return this.fail('Unexpected binary message');
      try { this.receive(JSON.parse(data.toString())); } catch { this.fail('Invalid realtime event'); }
    });
    socket.on('error', () => this.fail('Realtime transport error'));
    socket.on('close', () => this.finish());
  }
  send(event) {
    if (this.state === 'closed') return false;
    if (this.socket.readyState !== 1 || this.socket.bufferedAmount > this.maxSocketBytes) return this.fail('Realtime transport unavailable or backpressured');
    try { this.socket.send(JSON.stringify(event)); return true; }
    catch { return this.fail('Realtime transport send failed'); }
  }
  receive(event) {
    if (event.type === 'session.created') {
      if (this.state !== 'connecting' || event.session?.audio?.input?.format?.rate !== 16000 || event.session?.audio?.output?.format?.rate !== 24000) throw Error('Unexpected session format');
      this.state = 'initializing';
      this.send({ type: 'session.update', session: { type: 'realtime', instructions: this.instructions, tools: this.tools } });
    } else if (event.type === 'session.updated' && this.state === 'initializing') {
      this.state = 'ready'; this.emit('ready');
    } else if (event.type === 'response.created' && ['waiting', 'cancel_on_create'].includes(this.state)) {
      if (typeof event.response?.id !== 'string') throw Error('Missing response ID');
      const cancelImmediately = this.state === 'cancel_on_create';
      this.responseId = event.response.id; this.state = 'responding';
      if (cancelImmediately) this.cancel(); else this.emit('responseStart', this.responseId);
    } else if (event.type === 'response.output_audio.delta' || event.type === 'response.output_text.delta') {
      if (this.state !== 'responding' || event.response_id !== this.responseId) return;
      if (event.type === 'response.output_text.delta') {
        if (typeof event.delta !== 'string') throw Error('Invalid text');
        this.emit('text', event.delta, this.responseId);
      } else {
        if (typeof event.delta !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.delta)) throw Error('Invalid PCM');
        const pcm = Buffer.from(event.delta, 'base64');
        if (pcm.length % 2 || pcm.length > 262144) throw Error('Invalid PCM length');
        this.emit('audio', pcm, this.responseId);
      }
    } else if (event.type === 'response.done') {
      if (!['responding', 'cancelling'].includes(this.state) || event.response?.id !== this.responseId) return;
      const cancelled = this.state === 'cancelling';
      const output = event.response?.output ?? [];
      if (!Array.isArray(output)) throw Error('Invalid response output');
      const calls = output.filter(item => item.type === 'function_call');
      this.responseId = null;
      if (cancelled) { this.state = 'ready'; this.emit('cancelled'); return; }
      if (event.response?.status !== 'completed') return this.fail('Realtime response failed');
      if (calls.length > 1) return this.fail('Multiple tool calls are not supported');
      if (calls.length === 1) {
        const call = calls[0];
        if (typeof call.name !== 'string' || typeof call.call_id !== 'string' || typeof call.arguments !== 'string' || call.arguments.length > 8192) throw Error('Invalid tool call');
        this.pendingCall = call.call_id; this.state = 'awaiting_tool';
        this.emit('toolCall', { name: call.name, callId: call.call_id, arguments: call.arguments });
      } else { this.state = 'ready'; this.emit('responseDone'); }
    } else if (event.type === 'error') { this.fail('Realtime backend error'); }
  }
  appendAudio(pcm) {
    if (!['ready', 'collecting'].includes(this.state)) return false;
    if (!Buffer.isBuffer(pcm) || !pcm.length || pcm.length % 2 || this.inputBytes + pcm.length > this.maxInputBytes) return this.fail('Invalid or excessive input audio');
    if (!this.send({ type: 'input_audio_buffer.append', audio: pcm.toString('base64') })) return false;
    this.inputBytes += pcm.length; this.state = 'collecting'; return true;
  }
  endAudio() {
    if (this.state !== 'collecting') return false;
    this.inputBytes = 0; this.state = 'waiting';
    return this.send({ type: 'response.create' });
  }
  speakText(text) {
    if (this.state !== 'ready' || typeof text !== 'string' || !text.trim() || text.length > 1000) return false;
    if (!this.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } })) return false;
    this.state = 'waiting';
    return this.send({ type: 'response.create', response: { output_modalities: ['text', 'audio'], tool_choice: 'none' } });
  }
  submitToolResult(callId, output) {
    if (this.state !== 'awaiting_tool' || callId !== this.pendingCall || typeof output !== 'string' || output.length > 16000) return false;
    if (!this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } })) return false;
    this.pendingCall = null; this.state = 'waiting';
    return this.send({ type: 'response.create', response: { output_modalities: ['text', 'audio'] } });
  }
  cancel() {
    if (this.state === 'waiting') { this.state = 'cancel_on_create'; return true; }
    if (this.state !== 'responding') return false;
    this.state = 'cancelling'; this.emit('stopAudio', this.responseId);
    return this.send({ type: 'response.cancel' });
  }
  fail(reason) { if (this.state !== 'closed') { this.emit('fault', reason); this.finish(); this.socket.close(); } return false; }
  close() { if (this.state !== 'closed') { this.finish(); this.socket.close(); } }
  finish() { if (this.state !== 'closed') { this.state = 'closed'; this.pendingCall = null; this.emit('closed'); } }
}
