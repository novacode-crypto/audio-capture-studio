// Tipos compartidos entre background, offscreen, popup y side panel.

export type CaptureMode = 'smart' | 'continuous' | 'manual';

/** Fases visibles de la sesion. */
export type Phase =
  | 'idle'
  | 'starting'
  | 'waiting' // ESPERANDO AUDIO
  | 'recording' // GRABANDO
  | 'silence' // DETECTANDO SILENCIO
  | 'processing' // PROCESANDO
  | 'completed' // COMPLETADO
  | 'paused'
  | 'error';

export type ProfileId = 'voice' | 'music' | 'general' | 'custom';

export interface DetectionSettings {
  profile: ProfileId;
  /** Umbral de activacion (dBFS). */
  onDb: number;
  /** Umbral de silencio (dBFS), siempre inferior al de activacion (histeresis). */
  offDb: number;
  /** 0-100. 50 = neutro. Desplaza ambos umbrales. */
  sensitivity: number;
  minActivityMs: number;
  silenceMs: number;
  prebufferMs: number;
  /** Umbral adaptativo sobre el suelo de ruido estimado. */
  adaptive: boolean;
  /** Filtro paso alto / paso bajo de la ruta de ANALISIS (no afecta a la grabacion). */
  hpHz: number;
  lpHz: number;
}

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  domain: string;
  favIconUrl?: string;
}

export interface TechInfo {
  mime: string | null;
  codec: string | null;
  sampleRate: number | null;
  channels: number | null;
  /** Bitrate configurado en MediaRecorder (bps). */
  configuredBitrate: number | null;
  /** Bitrate medio real del ultimo segmento (bps), medido = tamano*8/duracion. */
  measuredBitrate: number | null;
  baseLatencyMs: number | null;
}

export interface SegmentSummary {
  id: string;
  name: string;
  durationMs: number;
  size: number;
  startedAt: number;
  endedAt: number;
}

export interface SessionState {
  active: boolean;
  phase: Phase;
  mode: CaptureMode | null;
  tab: TabInfo | null;
  sessionId: string | null;
  sessionStartedAt: number | null;
  sessionEndedAt: number | null;
  /** MediaRecorder grabando (no pausado). */
  recording: boolean;
  /** Cronometro del segmento en curso: base acumulada + (ahora - segRunningSince). */
  segBaseMs: number;
  segRunningSince: number | null;
  segStartedAt: number | null;
  audioTotalMs: number;
  segments: number;
  totalBytes: number;
  lastSegment: SegmentSummary | null;
  tech: TechInfo;
  error: string | null;
  passthrough: boolean;
}

export interface RecordingRecord {
  id: string;
  name: string;
  createdAt: number;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  mime: string;
  ext: string;
  size: number;
  blob: Blob;
  sourceTitle: string;
  sourceDomain: string;
  sourceUrl: string;
  tabId: number;
  kind: 'segment' | 'merged' | 'converted';
  sessionId: string;
  index: number;
  sampleRate: number | null;
  channels: number | null;
  bitrate: number | null;
  peakDb: number | null;
  rmsDb: number | null;
  mode: CaptureMode;
}

export interface VizFrame {
  k: 'frame';
  t: number;
  rmsDb: number;
  peakDb: number;
  min: number;
  max: number;
  spec: Uint8Array;
  sampleRate: number;
  onDb: number;
  offDb: number;
  noiseFloorDb: number;
  detector: 'idle' | 'candidate' | 'active';
}

export type BusMessage =
  | { k: 'state'; state: SessionState }
  | VizFrame
  | { k: 'event'; level: 'info' | 'success' | 'warn' | 'error'; text: string }
  | { k: 'sub' }
  | { k: 'hello' }
  | { k: 'library' };

export const EMPTY_TECH: TechInfo = {
  mime: null,
  codec: null,
  sampleRate: null,
  channels: null,
  configuredBitrate: null,
  measuredBitrate: null,
  baseLatencyMs: null,
};

export const IDLE_STATE: SessionState = {
  active: false,
  phase: 'idle',
  mode: null,
  tab: null,
  sessionId: null,
  sessionStartedAt: null,
  sessionEndedAt: null,
  recording: false,
  segBaseMs: 0,
  segRunningSince: null,
  segStartedAt: null,
  audioTotalMs: 0,
  segments: 0,
  totalBytes: 0,
  lastSegment: null,
  tech: EMPTY_TECH,
  error: null,
  passthrough: true,
};
