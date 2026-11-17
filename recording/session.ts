// Controlador de sesion: coordina motor de audio, detector, grabador, biblioteca y difusion de estado.
// Vive en el documento offscreen: no depende del popup, del side panel ni de la pestana activa.
import { ActivityDetector, type DetectorEvent } from '../audio-detector/detector';
import { CaptureEngine, type MeterMsg } from '../audio-engine/capture-engine';
import { SegmentRecorder, containerOf, pickMime, supportedRecorderMimes } from './segment-recorder';
import { putRecording, deleteRecording } from '../storage/db';
import { mergeToWav } from '../export/pcm';
import { BUS_NAME } from '../shared/bus';
import { buildName, dbFromLinear, formatDuration, uid } from '../shared/format';
import { delaySecondsFor, type AppSettings } from '../shared/settings';
import { IDLE_STATE, EMPTY_TECH, type BusMessage, type Phase, type RecordingRecord, type SessionState, type TabInfo } from '../shared/types';

export interface StartParams {
  streamId: string;
  tab: TabInfo;
  settings: AppSettings;
}

const SILENCE_PHASE_MS = 220; // a partir de este silencio se muestra "DETECTANDO SILENCIO"
const TRAIL_MS = 300; // cola de silencio conservada tras el ultimo sonido
const COMPLETED_FLASH_MS = 1800;
const SUB_TTL_MS = 4000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class SessionController {
  state: SessionState = { ...IDLE_STATE };
  private bus = new BroadcastChannel(BUS_NAME);
  private engine = new CaptureEngine();
  private detector: ActivityDetector | null = null;
  private settings: AppSettings | null = null;
  private current: SegmentRecorder | null = null;
  private finalizeTimer: ReturnType<typeof setTimeout> | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private saveChain: Promise<void> = Promise.resolve();
  private records: RecordingRecord[] = [];
  private segIndex = 0;
  private delaySec = 0;
  private lastSubAt = 0;
  private acc = { n: 0, ss: 0, peak: 0, min: 0, max: 0 };
  private seg = { peak: 0, ss: 0, n: 0 };
  private lastRmsDb = -120;
  private stopping = false;

  constructor(private workletUrl: string) {
    this.bus.onmessage = (e: MessageEvent<BusMessage>) => {
      if (e.data.k === 'sub') this.lastSubAt = Date.now();
      if (e.data.k === 'hello') {
        this.lastSubAt = Date.now();
        this.post({ k: 'state', state: this.state });
      }
    };
  }

  // ------------------------------------------------------------ difusion
  private post(m: BusMessage): void {
    this.bus.postMessage(m);
  }
  private setState(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    this.post({ k: 'state', state: this.state });
  }
  private setPhase(phase: Phase): void {
    if (this.state.phase !== phase) this.setState({ phase });
  }
  private emit(level: 'info' | 'success' | 'warn' | 'error', text: string): void {
    this.post({ k: 'event', level, text });
  }

  // ------------------------------------------------------------ ciclo de vida
  async start(p: StartParams): Promise<void> {
    if (this.state.active) throw new Error('Ya hay una sesion activa');
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.settings = p.settings;
    const s = p.settings;
    this.engine = new CaptureEngine();
    this.records = [];
    this.segIndex = 0;
    this.seg = { peak: 0, ss: 0, n: 0 };
    this.delaySec = delaySecondsFor(s.mode, s.detection);
    this.detector = new ActivityDetector(s.detection);
    this.setState({
      ...IDLE_STATE,
      phase: 'starting',
      mode: s.mode,
      tab: p.tab,
      passthrough: s.capture.passthrough,
      sessionId: uid(),
    });
    try {
      this.engine.onRaw = (m) => this.onRaw(m);
      this.engine.onDetect = (t, r, pk) => this.onDetect(t, r, pk);
      this.engine.onEnded = () => void this.onSourceEnded();
      await this.engine.start({
        streamId: p.streamId,
        hpHz: s.detection.hpHz,
        lpHz: s.detection.lpHz,
        delaySec: this.delaySec,
        passthrough: s.capture.passthrough,
        workletUrl: this.workletUrl,
      });
    } catch (e) {
      await this.engine.stop();
      const msg = e instanceof Error ? e.message : String(e);
      this.setState({ ...IDLE_STATE, phase: 'error', error: msg });
      throw new Error(msg);
    }
    const mime = pickMime() ?? null;
    const c = mime ? containerOf(mime) : null;
    this.setState({
      active: true,
      sessionStartedAt: Date.now(),
      tech: {
        ...EMPTY_TECH,
        mime: c?.mime ?? null,
        codec: c?.codec ?? null,
        sampleRate: this.engine.sampleRate,
        channels: this.engine.channelCount,
        configuredBitrate: s.capture.bitrate,
        baseLatencyMs: this.engine.baseLatencyMs,
      },
      phase: 'waiting',
    });
    this.emit('success', `Sesion iniciada en "${p.tab.title || p.tab.domain}"`);
    if (s.mode === 'continuous') await this.startRecorder(Date.now());
  }

  applySettings(s: AppSettings): void {
    this.settings = s;
    if (!this.state.active) return;
    this.detector?.update(s.detection);
    this.engine.setFilters(s.detection.hpHz, s.detection.lpHz);
    this.engine.setPassthrough(s.capture.passthrough);
    this.setState({ passthrough: s.capture.passthrough });
    // El pre-buffer solo se puede cambiar sin grabacion en curso (el retardo afectaria al audio ya grabado).
    if (this.state.mode === 'smart' && !this.current) {
      this.delaySec = delaySecondsFor('smart', s.detection);
      this.engine.setDelay(this.delaySec);
    }
  }

  async stop(reason: 'user' | 'source-closed' = 'user'): Promise<void> {
    if (!this.state.active || this.stopping) return;
    this.stopping = true;
    this.clearTimers();
    this.setState({ phase: 'processing' });
    if (this.current) {
      if (reason === 'user' && this.current.state !== 'inactive') await sleep(this.delaySec * 1000 + 60);
      await this.finishSegment(true);
    }
    await this.saveChain;
    const s = this.settings;
    if (s && s.mode === 'smart' && s.merge !== 'separate' && this.records.length > 1) await this.mergeSession(s);
    await this.engine.stop();
    this.detector = null;
    this.stopping = false;
    this.setState({ active: false, phase: 'completed', recording: false, segRunningSince: null, sessionEndedAt: Date.now() });
    this.emit('info', `Sesion finalizada: ${this.state.segments} segmento(s), ${formatDuration(this.state.audioTotalMs)} de audio`);
  }

  reset(): void {
    if (this.state.active) return;
    this.setState({ ...IDLE_STATE });
  }

  private clearTimers(): void {
    if (this.finalizeTimer) clearTimeout(this.finalizeTimer);
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.finalizeTimer = null;
    this.flashTimer = null;
  }

  private async onSourceEnded(): Promise<void> {
    if (!this.state.active) return;
    this.emit('error', 'La pestana de origen se cerro o dejo de compartir audio');
    await this.stop('source-closed');
  }

  // ------------------------------------------------------------ comandos manuales
  async startManual(): Promise<void> {
    if (!this.state.active || this.state.mode !== 'manual' || this.current) return;
    await this.startRecorder(Date.now());
  }

  pause(): void {
    const c = this.current;
    if (!c || this.state.segRunningSince === null) return;
    c.pause();
    this.setState({
      segBaseMs: this.state.segBaseMs + (Date.now() - this.state.segRunningSince),
      segRunningSince: null,
      recording: false,
      phase: 'paused',
    });
  }

  resume(): void {
    const c = this.current;
    if (!c || this.state.phase !== 'paused') return;
    c.resume();
    this.setState({ segRunningSince: Date.now(), recording: true, phase: 'recording' });
  }

  async finalizeSegment(): Promise<void> {
    if (!this.current) return;
    if (this.current.state === 'recording') await sleep(this.delaySec * 1000 + 60);
    await this.finishSegment(false);
  }

  // ------------------------------------------------------------ medicion
  private onRaw(m: MeterMsg): void {
    const a = this.acc;
    a.n++;
    a.ss += m.rms * m.rms;
    a.peak = Math.max(a.peak, m.peak);
    a.min = Math.min(a.min, m.min);
    a.max = Math.max(a.max, m.max);
    if (this.current && this.state.recording) {
      this.seg.peak = Math.max(this.seg.peak, m.peak);
      this.seg.ss += m.rms * m.rms;
      this.seg.n++;
    }
    if (a.n < 3) return;
    const rms = Math.sqrt(a.ss / a.n);
    this.lastRmsDb = dbFromLinear(rms);
    if (Date.now() - this.lastSubAt < SUB_TTL_MS) {
      const spec = new Uint8Array(this.engine.binCount);
      this.engine.readSpectrum(spec);
      const th = this.detector?.thresholds ?? { on: -46, off: -54 };
      this.post({
        k: 'frame',
        t: Date.now(),
        rmsDb: this.lastRmsDb,
        peakDb: dbFromLinear(a.peak),
        min: a.min,
        max: a.max,
        spec,
        sampleRate: m.sampleRate,
        onDb: th.on,
        offDb: th.off,
        noiseFloorDb: this.detector?.noiseFloorDb ?? -90,
        detector: this.detector?.state ?? 'idle',
      });
    }
    this.acc = { n: 0, ss: 0, peak: 0, min: 0, max: 0 };
  }

  private onDetect(tMs: number, rmsDb: number, peakDb: number): void {
    const d = this.detector;
    if (!d || !this.state.active || this.state.mode !== 'smart') return;
    const ev = d.push(tMs, rmsDb, peakDb);
    if (ev?.type === 'start') void this.onActivityStart(ev, tMs);
    else if (ev?.type === 'end') this.onActivityEnd(ev, tMs);
    if (d.state === 'active' && this.current && (this.state.phase === 'recording' || this.state.phase === 'silence')) {
      this.setPhase(d.silenceElapsed(tMs) >= SILENCE_PHASE_MS ? 'silence' : 'recording');
    }
  }

  // ------------------------------------------------------------ segmentos (modo inteligente)
  private async onActivityStart(ev: Extract<DetectorEvent, { type: 'start' }>, nowT: number): Promise<void> {
    if (this.finalizeTimer) {
      // El sonido volvio mientras se vaciaba el retardo: es el mismo segmento.
      clearTimeout(this.finalizeTimer);
      this.finalizeTimer = null;
      this.setPhase('recording');
      return;
    }
    if (this.current) return;
    this.emit('info', 'Sonido detectado');
    const preMs = this.settings?.detection.prebufferMs ?? 0;
    const contentStart = Date.now() - (nowT - ev.onsetMs) - preMs;
    await this.startRecorder(contentStart);
  }

  private onActivityEnd(ev: Extract<DetectorEvent, { type: 'end' }>, nowT: number): void {
    if (!this.current || this.finalizeTimer) return;
    const sil = nowT - ev.lastSoundMs;
    const trail = Math.min(sil, TRAIL_MS);
    const waitMs = Math.max(0, this.delaySec * 1000 - sil + trail);
    this.setPhase('silence');
    this.finalizeTimer = setTimeout(() => {
      this.finalizeTimer = null;
      void this.finishSegment(false);
    }, waitMs);
  }

  private async startRecorder(contentStartedAt: number): Promise<void> {
    if (this.current || !this.engine.recordStream || !this.settings) return;
    if (this.flashTimer) clearTimeout(this.flashTimer);
    const rec = new SegmentRecorder(this.engine.recordStream, this.settings.capture.bitrate);
    this.current = rec;
    try {
      await rec.start();
    } catch (e) {
      this.current = null;
      this.emit('error', e instanceof Error ? e.message : 'No se pudo iniciar la grabacion');
      return;
    }
    this.seg = { peak: 0, ss: 0, n: 0 };
    this.setState({
      recording: true,
      phase: 'recording',
      segBaseMs: 0,
      segRunningSince: Date.now(),
      segStartedAt: contentStartedAt,
    });
    this.emit('success', 'Grabacion iniciada');
  }

  private async finishSegment(final: boolean): Promise<void> {
    const rec = this.current;
    if (!rec) return;
    this.current = null;
    if (this.finalizeTimer) clearTimeout(this.finalizeTimer);
    this.finalizeTimer = null;
    this.setState({ phase: 'processing', recording: false, segRunningSince: null });
    let res;
    try {
      res = await rec.stop();
    } catch (e) {
      this.emit('error', `No se pudo finalizar el segmento: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const s = this.settings!;
    const tab = this.state.tab!;
    const index = ++this.segIndex;
    const startedAt = this.state.segStartedAt ?? res.startedAt;
    const record: RecordingRecord = {
      id: uid(),
      name: buildName(s.export.template, { page: tab.title || tab.domain, ts: startedAt, seg: index }),
      createdAt: Date.now(),
      startedAt,
      endedAt: res.endedAt,
      durationMs: res.durationMs,
      mime: res.mime,
      ext: res.ext,
      size: res.blob.size,
      blob: res.blob,
      sourceTitle: tab.title,
      sourceDomain: tab.domain,
      sourceUrl: tab.url,
      tabId: tab.id,
      kind: 'segment',
      sessionId: this.state.sessionId ?? '',
      index,
      sampleRate: this.state.tech.sampleRate,
      channels: this.state.tech.channels,
      bitrate: res.durationMs > 0 ? Math.round((res.blob.size * 8) / (res.durationMs / 1000)) : null,
      peakDb: this.seg.peak > 0 ? dbFromLinear(this.seg.peak) : null,
      rmsDb: this.seg.n > 0 ? dbFromLinear(Math.sqrt(this.seg.ss / this.seg.n)) : null,
      mode: s.mode,
    };
    this.records.push(record);
    this.setState({
      segments: this.state.segments + 1,
      audioTotalMs: this.state.audioTotalMs + res.durationMs,
      totalBytes: this.state.totalBytes + res.blob.size,
      segBaseMs: 0,
      segStartedAt: null,
      lastSegment: { id: record.id, name: record.name, durationMs: record.durationMs, size: record.size, startedAt, endedAt: record.endedAt },
      tech: { ...this.state.tech, measuredBitrate: record.bitrate },
    });
    this.saveChain = this.saveChain
      .then(() => putRecording(record))
      .then(() => this.post({ k: 'library' }))
      .catch((e) => this.emit('error', `No se pudo guardar el segmento en la biblioteca: ${e instanceof Error ? e.message : String(e)}`));
    this.emit('success', `Segmento ${index} finalizado (${formatDuration(res.durationMs, true)})`);
    if (final) return;
    this.setPhase('completed');
    this.flashTimer = setTimeout(() => {
      if (this.state.active && this.state.phase === 'completed') this.setPhase('waiting');
    }, COMPLETED_FLASH_MS);
  }

  private async mergeSession(s: AppSettings): Promise<void> {
    try {
      const { blob, durationMs } = await mergeToWav(this.records.map((r) => r.blob));
      const tab = this.state.tab!;
      const first = this.records[0];
      const base = buildName(s.export.template, { page: tab.title || tab.domain, ts: first.startedAt, seg: 0 }).replace(/seg000$/, 'unido');
      const merged: RecordingRecord = {
        ...first,
        id: uid(),
        name: base,
        createdAt: Date.now(),
        endedAt: Date.now(),
        durationMs,
        mime: 'audio/wav',
        ext: 'wav',
        size: blob.size,
        blob,
        kind: 'merged',
        index: 0,
        bitrate: null,
      };
      await putRecording(merged);
      if (s.merge === 'merged') await Promise.all(this.records.map((r) => deleteRecording(r.id)));
      this.post({ k: 'library' });
      this.emit('success', `Segmentos unidos en un archivo WAV (${formatDuration(durationMs)})`);
    } catch (e) {
      this.emit('warn', `No se pudo unir los segmentos (se conservan por separado): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  static availableMimes(): string[] {
    return supportedRecorderMimes();
  }
}
