/* Процедурный звук (WebAudio) — без внешних файлов. */

type ToneOpts = {
  type?: OscillatorType;
  vol?: number;
  slide?: number;
  delay?: number;
};

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  ensure() {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  private tone(freq: number, dur: number, opts: ToneOpts = {}) {
    if (!this.ctx || !this.master || this.muted) return;
    const { type = "sine", vol = 0.2, slide = 0, delay = 0 } = opts;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, freq), t0);
    if (slide) {
      o.frequency.exponentialRampToValueAtTime(
        Math.max(30, freq + slide),
        t0 + dur
      );
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, delay = 0, freq = 1600) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  shot() {
    this.tone(340, 0.09, { type: "square", vol: 0.1, slide: -170 });
    this.tone(760, 0.05, { type: "sine", vol: 0.07, slide: -320 });
  }

  insert() {
    this.tone(210, 0.07, { type: "triangle", vol: 0.18, slide: -70 });
    this.noise(0.04, 0.08, 0, 900);
  }

  pop(combo: number) {
    const base = 330 * Math.pow(1.15, Math.min(combo, 9));
    this.tone(base, 0.09, { type: "square", vol: 0.13 });
    this.tone(base * 1.26, 0.1, { type: "square", vol: 0.11, delay: 0.05 });
    this.tone(base * 1.5, 0.15, { type: "triangle", vol: 0.12, delay: 0.1 });
    this.noise(0.09, 0.12, 0, 2400);
  }

  swap() {
    this.tone(480, 0.06, { type: "sine", vol: 0.1, slide: 140 });
  }

  win() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone(f, 0.17, { type: "triangle", vol: 0.16, delay: i * 0.09 })
    );
    this.noise(0.3, 0.05, 0.1, 3200);
  }

  die() {
    this.tone(170, 0.5, { type: "sawtooth", vol: 0.14, slide: -130 });
    this.tone(85, 0.6, { type: "sine", vol: 0.2, slide: -45, delay: 0.06 });
  }

  over() {
    [392, 311, 262, 196].forEach((f, i) =>
      this.tone(f, 0.24, { type: "triangle", vol: 0.15, delay: i * 0.15 })
    );
  }

  click() {
    this.tone(620, 0.05, { type: "sine", vol: 0.08 });
  }
}

export const sfx = new Sfx();
