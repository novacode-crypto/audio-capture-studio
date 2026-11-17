// Decodificacion / codificacion PCM local (WAV) sin servicios externos.

export interface PcmOptions {
  sampleRate: number; // 0 = 48000 (frecuencia nativa de Opus)
  channels: 0 | 1 | 2; // 0 = origen
  gainDb: number;
  normalize: boolean;
}

const DEFAULT_RATE = 48000;

export async function decodeBlob(blob: Blob, sampleRate = DEFAULT_RATE): Promise<AudioBuffer> {
  const ab = await blob.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, sampleRate);
  return ctx.decodeAudioData(ab);
}

function writeString(v: DataView, o: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
}

function wavHeader(dataBytes: number, channels: number, sr: number): ArrayBuffer {
  const h = new ArrayBuffer(44);
  const v = new DataView(h);
  writeString(v, 0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  writeString(v, 8, 'WAVE');
  writeString(v, 12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  writeString(v, 36, 'data');
  v.setUint32(40, dataBytes, true);
  return h;
}

function floatToInt16(x: number): number {
  const c = x < -1 ? -1 : x > 1 ? 1 : x;
  return c < 0 ? c * 0x8000 : c * 0x7fff;
}

function interleaveInt16(chs: Float32Array[]): Int16Array<ArrayBuffer> {
  const n = chs[0].length;
  const out = new Int16Array(n * chs.length);
  for (let i = 0; i < n; i++) for (let c = 0; c < chs.length; c++) out[i * chs.length + c] = floatToInt16(chs[c][i]);
  return out;
}

function channelsOf(buf: AudioBuffer, want: 0 | 1 | 2): Float32Array[] {
  const src: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) src.push(buf.getChannelData(c));
  const target = want || Math.min(2, src.length);
  if (target === src.length) return src.map((a) => new Float32Array(a));
  if (target === 1) {
    const m = new Float32Array(buf.length);
    for (let i = 0; i < m.length; i++) {
      let s = 0;
      for (const ch of src) s += ch[i];
      m[i] = s / src.length;
    }
    return [m];
  }
  // mono -> estereo
  return [new Float32Array(src[0]), new Float32Array(src[0])];
}

export function processChannels(buf: AudioBuffer, o: Pick<PcmOptions, 'channels' | 'gainDb' | 'normalize'>): Float32Array[] {
  const chs = channelsOf(buf, o.channels);
  let gain = 10 ** (o.gainDb / 20);
  if (o.normalize) {
    let peak = 0;
    for (const ch of chs) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    if (peak > 0) gain *= 10 ** (-1 / 20) / peak; // pico a -1 dBFS
  }
  if (gain !== 1) for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
  return chs;
}

export async function blobToWav(blob: Blob, o: PcmOptions): Promise<Blob> {
  const sr = o.sampleRate || DEFAULT_RATE;
  const buf = await decodeBlob(blob, sr);
  const chs = processChannels(buf, o);
  const pcm = interleaveInt16(chs);
  return new Blob([wavHeader(pcm.byteLength, chs.length, buf.sampleRate), pcm], { type: 'audio/wav' });
}

/** Une varios segmentos en un WAV (limite de memoria: maxMs de audio resultante). */
export async function mergeToWav(blobs: Blob[], maxMs = 20 * 60_000): Promise<{ blob: Blob; durationMs: number }> {
  const parts: Int16Array<ArrayBuffer>[] = [];
  let channels = 0;
  let frames = 0;
  for (const b of blobs) {
    const buf = await decodeBlob(b);
    if (!channels) channels = Math.min(2, buf.numberOfChannels);
    const chs = channelsOf(buf, channels as 1 | 2);
    frames += chs[0].length;
    if ((frames / DEFAULT_RATE) * 1000 > maxMs) throw new Error('La union supera el limite de 20 minutos de audio');
    parts.push(interleaveInt16(chs));
  }
  const bytes = frames * channels * 2;
  return { blob: new Blob([wavHeader(bytes, channels, DEFAULT_RATE), ...parts], { type: 'audio/wav' }), durationMs: (frames / DEFAULT_RATE) * 1000 };
}
