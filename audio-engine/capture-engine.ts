// Motor de audio: consume el stream de la pestana y construye el grafo de Web Audio.
//
//  tab stream -> source -+-> passGain ------------------------> destination (el usuario sigue oyendo la pestana)
//                        +-> rawMeter (AudioWorklet) -> mute --> destination   (visualizacion: RMS/pico/min/max)
//                        +-> analyser (FFT 4096)                                (espectrograma)
//                        +-> highpass -> lowpass -> detMeter -> mute -> dest    (deteccion de actividad)
//                        +-> delay (pre-buffer) -> MediaStreamDestination -> MediaRecorder
//
// El DelayNode permite recuperar el sonido previo al disparo de la deteccion con MediaRecorder.
import { dbFromLinear } from '../shared/format';

export interface MeterMsg {
  rms: number;
  peak: number;
  min: number;
  max: number;
  n: number;
  frame: number;
  sampleRate: number;
}

export interface EngineOptions {
  streamId: string;
  hpHz: number;
  lpHz: number;
  delaySec: number;
  passthrough: boolean;
  workletUrl: string;
}

export class CaptureEngine {
  ctx: AudioContext | null = null;
  stream: MediaStream | null = null;
  recordStream: MediaStream | null = null;
  channelCount: number | null = null;
  onDetect: ((tMs: number, rmsDb: number, peakDb: number) => void) | null = null;
  onRaw: ((m: MeterMsg) => void) | null = null;
  onEnded: (() => void) | null = null;

  private nodes: AudioNode[] = [];
  private hp: BiquadFilterNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private delay: DelayNode | null = null;
  private pass: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private stopped = false;

  async start(o: EngineOptions): Promise<void> {
    const constraints = {
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: o.streamId } },
      video: false,
    } as unknown as MediaStreamConstraints;
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = this.stream.getAudioTracks()[0];
    if (!track) throw new Error('La pestana no proporciona pista de audio');
    track.addEventListener('ended', () => {
      if (!this.stopped) this.onEnded?.();
    });
    this.channelCount = track.getSettings().channelCount ?? null;

    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    await ctx.audioWorklet.addModule(o.workletUrl);

    const source = ctx.createMediaStreamSource(this.stream);
    this.nodes.push(source);
    if (this.channelCount === null) this.channelCount = source.channelCount;

    // Reproduccion: tabCapture silencia la pestana; la reenviamos para que el usuario siga oyendola.
    this.pass = ctx.createGain();
    this.pass.gain.value = o.passthrough ? 1 : 0;
    source.connect(this.pass).connect(ctx.destination);

    // Medidor sin filtrar (visualizacion)
    const raw = new AudioWorkletNode(ctx, 'meter-processor', { processorOptions: { block: 512 }, numberOfOutputs: 1, outputChannelCount: [1] });
    raw.port.onmessage = (e: MessageEvent<MeterMsg>) => this.onRaw?.(e.data);
    source.connect(raw);
    raw.connect(ctx.destination);

    // Analizador FFT
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.45;
    this.analyser.minDecibels = -100;
    this.analyser.maxDecibels = -20;
    source.connect(this.analyser);

    // Ruta de analisis para la deteccion
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.Q.value = 0.707;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.707;
    this.setFilters(o.hpHz, o.lpHz);
    const det = new AudioWorkletNode(ctx, 'meter-processor', { processorOptions: { block: 1024 }, numberOfOutputs: 1, outputChannelCount: [1] });
    det.port.onmessage = (e: MessageEvent<MeterMsg>) => {
      const m = e.data;
      this.onDetect?.((m.frame / m.sampleRate) * 1000, dbFromLinear(m.rms), dbFromLinear(m.peak));
    };
    source.connect(this.hp).connect(this.lp).connect(det);
    det.connect(ctx.destination);

    // Ruta de grabacion con retardo (pre-buffer)
    this.delay = ctx.createDelay(10);
    this.delay.delayTime.value = o.delaySec;
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = 2;
    source.connect(this.delay).connect(dest);
    this.recordStream = dest.stream;

    this.nodes.push(this.pass, raw, this.analyser, this.hp, this.lp, det, this.delay, dest);
  }

  get sampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }
  get baseLatencyMs(): number | null {
    return this.ctx ? this.ctx.baseLatency * 1000 : null;
  }

  setFilters(hpHz: number, lpHz: number): void {
    if (!this.ctx || !this.hp || !this.lp) return;
    const nyq = this.ctx.sampleRate / 2;
    this.hp.frequency.value = Math.max(10, Math.min(hpHz, nyq * 0.9));
    this.lp.frequency.value = Math.max(100, Math.min(lpHz, nyq * 0.95));
  }

  setDelay(sec: number): void {
    if (this.delay) this.delay.delayTime.value = Math.max(0, Math.min(sec, 10));
  }

  setPassthrough(on: boolean): void {
    if (this.pass) this.pass.gain.value = on ? 1 : 0;
  }

  readSpectrum(buf: Uint8Array<ArrayBuffer>): void {
    this.analyser?.getByteFrequencyData(buf);
  }

  get binCount(): number {
    return this.analyser?.frequencyBinCount ?? 0;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* nodo ya desconectado */
      }
    }
    this.nodes = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recordStream = null;
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close().catch(() => undefined);
    this.ctx = null;
  }
}
