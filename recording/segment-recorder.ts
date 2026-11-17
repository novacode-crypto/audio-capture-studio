// Grabacion de segmentos con MediaRecorder.

const CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm',
];

export function supportedRecorderMimes(): string[] {
  if (typeof MediaRecorder === 'undefined') return [];
  return CANDIDATES.filter((m) => MediaRecorder.isTypeSupported(m));
}

export function pickMime(): string | undefined {
  return supportedRecorderMimes()[0];
}

export function containerOf(mime: string): { mime: string; ext: string; codec: string | null } {
  const base = mime.split(';')[0].trim().toLowerCase();
  const codec = /codecs=([^;]+)/i.exec(mime)?.[1]?.replace(/"/g, '') ?? null;
  const ext = base === 'audio/webm' ? 'webm' : base === 'audio/ogg' ? 'ogg' : base === 'audio/mp4' ? 'm4a' : base === 'audio/wav' ? 'wav' : 'bin';
  return { mime: base, ext, codec };
}

export interface SegmentResult {
  blob: Blob;
  mime: string;
  ext: string;
  codec: string | null;
  durationMs: number;
  startedAt: number;
  endedAt: number;
}

export class SegmentRecorder {
  private rec: MediaRecorder;
  private chunks: Blob[] = [];
  private accMs = 0;
  private runStart: number | null = null;
  startedAt = 0;
  readonly mime: string;

  constructor(stream: MediaStream, bitrate: number) {
    const mime = pickMime();
    this.rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: bitrate });
    this.mime = this.rec.mimeType || mime || 'audio/webm';
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.rec.onstart = () => {
        this.runStart = performance.now();
        this.startedAt = Date.now();
        resolve();
      };
      this.rec.onerror = () => reject(new Error('MediaRecorder fallo al iniciar'));
      this.rec.start(1000);
    });
  }

  get state(): RecordingState {
    return this.rec.state;
  }

  pause(): void {
    if (this.rec.state !== 'recording' || this.runStart === null) return;
    this.rec.pause();
    this.accMs += performance.now() - this.runStart;
    this.runStart = null;
  }

  resume(): void {
    if (this.rec.state !== 'paused') return;
    this.rec.resume();
    this.runStart = performance.now();
  }

  stop(): Promise<SegmentResult> {
    return new Promise((resolve, reject) => {
      if (this.rec.state === 'inactive') return reject(new Error('Grabador inactivo'));
      this.rec.onstop = () => {
        const durationMs = this.accMs + (this.runStart !== null ? performance.now() - this.runStart : 0);
        const c = containerOf(this.mime);
        resolve({
          blob: new Blob(this.chunks, { type: c.mime }),
          mime: c.mime,
          ext: c.ext,
          codec: c.codec,
          durationMs,
          startedAt: this.startedAt,
          endedAt: Date.now(),
        });
      };
      this.rec.onerror = () => reject(new Error('MediaRecorder fallo al finalizar'));
      this.rec.stop();
    });
  }
}
