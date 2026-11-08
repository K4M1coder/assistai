import { audioEngine } from './audioSynthesizer';
import { TranscriptMessage, Artifact, IntegrationsState } from '../types';

export interface VoiceSocketCallbacks {
  onStatusChange?: (connected: boolean, mode: string) => void;
  onTranscript?: (msg: TranscriptMessage) => void;
  onAgentChunk?: (text: string, isFinal: boolean) => void;
  onInterrupted?: (reason?: string) => void;
  onToolExecution?: (tool: string, params: any, result: any, artifacts?: Artifact[], integrations?: IntegrationsState) => void;
  onAudioMeter?: (rms: number, source: 'user' | 'agent') => void;
  onSwitchSession?: (projectId: string, sessionId: string, session?: any, spokenSummary?: string) => void;
}

class VoiceSocketService {
  private ws: WebSocket | null = null;
  private callbacks: VoiceSocketCallbacks = {};
  private isConnected: boolean = false;
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private micCheckInterval: any = null;
  private isMicActive: boolean = false;
  private isAgentSpeaking: boolean = false;
  private vadThreshold: number = 0.07; // RMS threshold to trigger interruption

  public setCallbacks(cbs: VoiceSocketCallbacks) {
    this.callbacks = { ...this.callbacks, ...cbs };
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/live-ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.callbacks.onStatusChange?.(true, 'Full-Duplex 24kHz Mochi Live');
        audioEngine.playCue('connect');
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.callbacks.onStatusChange?.(false, 'Disconnected');
        setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = (err) => {
        console.warn('Voice WebSocket warning/error:', err);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };
    } catch (err) {
      console.warn('WebSocket init exception:', err);
    }
  }

  private handleServerMessage(data: any) {
    switch (data.type) {
      case 'handshake':
        this.callbacks.onStatusChange?.(true, data.hasGeminiLive ? 'Gemini 3.8 Live Duplex' : 'Mochi Live Server Ready');
        break;

      case 'transcript':
        this.callbacks.onTranscript?.({
          id: 't-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          role: data.role,
          text: data.text,
          timestamp: data.timestamp || Date.now()
        });
        break;

      case 'agent_speak_chunk':
        this.isAgentSpeaking = true;
        this.callbacks.onAgentChunk?.(data.text, data.isFinal || false);
        break;

      case 'agent_speak_end':
        this.isAgentSpeaking = false;
        // Optionally play voice audio locally through synthesis if audio stream wasn't directly piped
        if (data.fullText) {
          audioEngine.speak(data.fullText, undefined, () => {
            this.isAgentSpeaking = false;
          });
        }
        break;

      case 'interrupted':
        this.isAgentSpeaking = false;
        audioEngine.interrupt();
        audioEngine.playCue('interrupt');
        this.callbacks.onInterrupted?.(data.reason);
        break;

      case 'tool_execution':
        audioEngine.playCue('chime');
        this.callbacks.onToolExecution?.(data.tool, data.params, data.result, data.artifacts, data.integrations);
        break;

      case 'switch_session':
        audioEngine.playCue('chime');
        this.callbacks.onSwitchSession?.(data.projectId, data.sessionId, data.session, data.spokenSummary);
        break;

      case 'audio_meter':
        this.callbacks.onAudioMeter?.(data.rms, data.source);
        break;
    }
  }

  // Trigger manual or programmatic interruption
  public sendInterrupt() {
    this.isAgentSpeaking = false;
    audioEngine.interrupt();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'interrupt' }));
    }
    this.callbacks.onInterrupted?.('User initiated manual interrupt');
  }

  // Send typed or voice text turn
  public sendText(text: string) {
    if (!text.trim()) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'text_input', text: text.trim() }));
    }
  }

  // Start real microphone capture with VAD (Voice Activity Detection)
  public async startMicrophone(): Promise<boolean> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('Microphone getUserMedia not available in this browser context');
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      this.micStream = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtx({ sampleRate: 16000 });
      const source = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);

      this.isMicActive = true;
      const buffer = new Float32Array(this.analyser.fftSize);

      this.micCheckInterval = setInterval(() => {
        if (!this.analyser || !this.isMicActive) return;
        this.analyser.getFloatTimeDomainData(buffer);

        // Compute Root Mean Square (RMS)
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sum / buffer.length);

        // Send meter update
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'audio_chunk', rms, source: 'user' }));
        }
        this.callbacks.onAudioMeter?.(rms, 'user');

        // Natural interruption: user speaks over assistant
        if (this.isAgentSpeaking && rms > this.vadThreshold) {
          this.sendInterrupt();
        }
      }, 70);

      return true;
    } catch (e: any) {
      console.warn('Microphone access denied or unavailable:', e);
      return false;
    }
  }

  public stopMicrophone() {
    this.isMicActive = false;
    if (this.micCheckInterval) {
      clearInterval(this.micCheckInterval);
      this.micCheckInterval = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  public isMicRunning(): boolean {
    return this.isMicActive;
  }
}

export const voiceSocket = new VoiceSocketService();
