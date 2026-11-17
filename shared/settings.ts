import type { CaptureMode, DetectionSettings } from './types';

export type QualityId = 'max' | 'high' | 'balanced' | 'compact' | 'custom';

export interface ExportSettings {
  format: string;
  quality: QualityId;
  bitrate: number;
  sampleRate: number; // 0 = origen
  channels: 0 | 1 | 2; // 0 = origen
  normalize: boolean;
  gainDb: number;
  metadata: boolean;
  saveAs: boolean;
  template: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  mode: CaptureMode;
  detection: DetectionSettings;
  merge: 'separate' | 'merged' | 'both';
  capture: { bitrate: number; passthrough: boolean };
  viz: { view: 'both' | 'spectrogram' | 'waveform'; maxFreq: number; scale: 'log' | 'linear'; floor: number; speed: number };
  export: ExportSettings;
  service: { portOverride: number | null; token: string };
  ui: { tooltipDelay: number };
}

import { PROFILES } from './profiles';
export { PROFILES };

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  mode: 'smart',
  detection: { profile: 'general', sensitivity: 50, adaptive: false, ...PROFILES.general },
  merge: 'separate',
  capture: { bitrate: 192000, passthrough: true },
  viz: { view: 'both', maxFreq: 8000, scale: 'log', floor: 20, speed: 2 },
  export: {
    format: 'native', quality: 'high', bitrate: 192, sampleRate: 0, channels: 0,
    normalize: false, gainDb: 0, metadata: true, saveAs: false,
    template: '{page}_{date}_{time}_{seg}',
  },
  service: { portOverride: null, token: '' },
  ui: { tooltipDelay: 450 },
};

export const QUALITY_PRESETS: Record<Exclude<QualityId, 'custom'>, { label: string; bitrate: number; flacLevel: number }> = {
  max: { label: 'Maxima', bitrate: 320, flacLevel: 8 },
  high: { label: 'Alta', bitrate: 192, flacLevel: 6 },
  balanced: { label: 'Equilibrada', bitrate: 128, flacLevel: 5 },
  compact: { label: 'Compacta', bitrate: 64, flacLevel: 3 },
};

export const PREBUFFER_OPTIONS = [100, 250, 500, 1000];
export const SILENCE_OPTIONS = [250, 500, 750, 1000, 1500, 2000];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(base) || !isObj(patch)) return (patch === undefined ? base : (patch as T));
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isObj(out[k]) && isObj(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

const KEY = 'settings';

export async function loadSettings(): Promise<AppSettings> {
  const r = await chrome.storage.local.get(KEY);
  return deepMerge(DEFAULT_SETTINGS, r[KEY]);
}

export async function saveSettings(next: AppSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: next });
}

export function onSettingsChanged(cb: (s: AppSettings) => void): () => void {
  const fn = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) cb(deepMerge(DEFAULT_SETTINGS, changes[KEY].newValue));
  };
  chrome.storage.onChanged.addListener(fn);
  return () => chrome.storage.onChanged.removeListener(fn);
}

/** Retardo interno (s) del DelayNode que permite recuperar el pre-buffer con MediaRecorder. */
export function delaySecondsFor(mode: CaptureMode, d: DetectionSettings): number {
  return mode === 'smart' ? (d.prebufferMs + d.minActivityMs + 60) / 1000 : 0;
}
