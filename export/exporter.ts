// Exportacion multiformato: WAV y contenedor original se generan localmente; el resto con FFmpeg local.
import { QUALITY_PRESETS, type AppSettings, type ExportSettings } from '../shared/settings';
import { sanitizeFilename } from '../shared/format';
import type { RecordingRecord } from '../shared/types';
import { blobToWav } from './pcm';
import { serviceConvert, type ServiceFormat } from './service-client';

export interface FormatChoice {
  id: string;
  label: string;
  ext: string;
  /** local = sin servicio; service = requiere FFmpeg */
  source: 'native' | 'local' | 'service';
  available: boolean;
  reason?: string;
  lossless?: boolean;
}

export function listFormats(rec: RecordingRecord, serviceFormats: ServiceFormat[] | null): FormatChoice[] {
  const out: FormatChoice[] = [
    { id: 'native', label: `Original (${rec.ext.toUpperCase()})`, ext: rec.ext, source: 'native', available: true },
    { id: 'wav', label: 'WAV (PCM 16 bit)', ext: 'wav', source: 'local', available: true, lossless: true },
  ];
  const order = ['mp3', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'webm'];
  for (const id of order) {
    const f = serviceFormats?.find((s) => s.id === id);
    out.push({
      id,
      label: f?.label ?? id.toUpperCase(),
      ext: f?.ext ?? id,
      source: 'service',
      available: Boolean(f?.available),
      lossless: id === 'flac',
      reason: serviceFormats === null ? 'Requiere el servicio multimedia (start.bat) y su token' : f?.available ? undefined : 'Este FFmpeg no incluye el codificador',
    });
  }
  return out;
}

export function effectiveBitrate(e: ExportSettings): number {
  return e.quality === 'custom' ? e.bitrate : QUALITY_PRESETS[e.quality].bitrate;
}

export interface ExportResult { blob: Blob; ext: string; mime: string; filename: string }

export async function runExport(rec: RecordingRecord, formatId: string, e: ExportSettings, name: string, app: AppSettings): Promise<ExportResult> {
  const base = sanitizeFilename(name);
  if (formatId === 'native') return { blob: rec.blob, ext: rec.ext, mime: rec.mime, filename: `${base}.${rec.ext}` };
  if (formatId === 'wav') {
    const blob = await blobToWav(rec.blob, { sampleRate: e.sampleRate, channels: e.channels, gainDb: e.gainDb, normalize: e.normalize });
    return { blob, ext: 'wav', mime: 'audio/wav', filename: `${base}.wav` };
  }
  const meta: Record<string, string> = {};
  if (e.metadata) {
    meta.title = base;
    meta.artist = rec.sourceDomain || 'Audio Capture Studio';
    meta.album = 'Audio Capture Studio';
    meta.date = new Date(rec.startedAt).toISOString().slice(0, 10);
    meta.comment = `Capturado de ${rec.sourceDomain || 'pestana'} el ${new Date(rec.startedAt).toLocaleString('es-ES')}`;
  }
  const q = e.quality === 'custom' ? 5 : QUALITY_PRESETS[e.quality].flacLevel;
  const r = await serviceConvert(
    rec.blob,
    { format: formatId, bitrate: effectiveBitrate(e), sampleRate: e.sampleRate, channels: e.channels, normalize: e.normalize, gainDb: e.gainDb, flacLevel: q, meta },
    app,
  );
  return { blob: r.blob, ext: r.ext, mime: r.mime, filename: `${base}.${r.ext}` };
}

export async function downloadBlob(blob: Blob, filename: string, saveAs: boolean): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    if (chrome.downloads?.download) {
      await chrome.downloads.download({ url, filename, saveAs, conflictAction: 'uniquify' });
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
  }
}
