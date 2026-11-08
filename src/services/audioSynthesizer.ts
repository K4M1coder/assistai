// WebAudio Engine for Voice Output, Interruption Truncation, and Music Synthesis

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private activeMusicNodes: OscillatorNode[] = [];
  private isMusicPlaying: boolean = false;
  private musicInterval: any = null;

  public init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx({ sampleRate: 24000 });
      }
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.interrupt();
    }
  }

  // Instant interruption: immediately stops any spoken audio or synthesizer
  public interrupt() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
    this.stopMusic();
  }

  // Play synthetic voice turn with real-time word boundary callback
  public speak(
    text: string,
    onBoundary?: (charIndex: number) => void,
    onEnd?: () => void
  ) {
    if (this.isMuted || typeof window === 'undefined') return;

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel(); // Clear any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      // Select a nice natural sounding voice if available
      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(
        (v) =>
          (v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')))
      ) || voices[0];
      if (naturalVoice) {
        utterance.voice = naturalVoice;
      }

      utterance.onboundary = (e) => {
        if (onBoundary) onBoundary(e.charIndex);
      };

      utterance.onend = () => {
        this.currentUtterance = null;
        if (onEnd) onEnd();
      };

      utterance.onerror = () => {
        this.currentUtterance = null;
        if (onEnd) onEnd();
      };

      this.currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    }
  }

  // Play polyphonic synthesized sequence for generated music
  public playMusicNotes(notes: string[], tempo = 100, onStep?: (step: number) => void) {
    this.init();
    if (!this.ctx) return;
    this.stopMusic();

    const freqMap: Record<string, number> = {
      C3: 130.81, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, G3: 196.00,
      A3: 220.00, Bb3: 233.08, B3: 246.94, C4: 261.63, D4: 293.66, Eb4: 311.13,
      E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, Bb4: 466.16, C5: 523.25
    };

    let step = 0;
    const stepDuration = (60 / tempo) * 1000 * 0.5;
    this.isMusicPlaying = true;

    this.musicInterval = setInterval(() => {
      if (!this.isMusicPlaying || !this.ctx) {
        clearInterval(this.musicInterval);
        return;
      }

      const note = notes[step % notes.length];
      const freq = freqMap[note] || 220;

      // Create warm synth oscillator with envelope
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = step % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800 + Math.sin(step) * 300, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + stepDuration / 1000);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + stepDuration / 1000);

      if (onStep) onStep(step % notes.length);
      step++;
    }, stepDuration);
  }

  public stopMusic() {
    this.isMusicPlaying = false;
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  // Synthesize short audio cue (e.g. beep, tool chime, interruption tick)
  public playCue(type: 'chime' | 'interrupt' | 'connect') {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (type === 'chime') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'interrupt') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.linearRampToValueAtTime(140, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'connect') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.18);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }

    osc.connect(gain);
    gain.connect(this.ctx.destination);
  }
}

export const audioEngine = new AudioEngine();
