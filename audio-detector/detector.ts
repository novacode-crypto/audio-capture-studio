// Motor de deteccion de actividad sonora.
// Basado en nivel RMS / pico por bloque (dBFS), histeresis (umbral de activacion y de
// silencio diferenciados), duracion minima de actividad y silencio sostenido.
// No detecta "el primer/ultimo bit digital": identifica los limites perceptibles
// de actividad segun los parametros configurados.

export interface DetectorConfig {
  onDb: number;
  offDb: number;
  /** 0-100, 50 = neutro. Cada punto desplaza 0.3 dB ambos umbrales. */
  sensitivity: number;
  minActivityMs: number;
  silenceMs: number;
  adaptive: boolean;
}

export type DetectorState = 'idle' | 'candidate' | 'active';

export type DetectorEvent =
  | { type: 'start'; onsetMs: number; atMs: number }
  | { type: 'end'; lastSoundMs: number; atMs: number };

const MIN_HYSTERESIS_DB = 3;
const ADAPTIVE_MARGIN_DB = 10;
const FLOOR_ALPHA = 0.01;

export class ActivityDetector {
  state: DetectorState = 'idle';
  noiseFloorDb = -90;
  onsetMs = 0;
  lastSoundMs = 0;
  private cfg: DetectorConfig;

  constructor(cfg: DetectorConfig) {
    this.cfg = { ...cfg };
  }

  update(cfg: DetectorConfig): void {
    this.cfg = { ...cfg };
  }

  get thresholds(): { on: number; off: number } {
    const shift = (this.cfg.sensitivity - 50) * 0.3;
    let on = this.cfg.onDb - shift;
    if (this.cfg.adaptive) on = Math.max(on, this.noiseFloorDb + ADAPTIVE_MARGIN_DB);
    const off = Math.min(this.cfg.offDb - shift, on - MIN_HYSTERESIS_DB);
    return { on, off };
  }

  reset(): void {
    this.state = 'idle';
    this.onsetMs = 0;
    this.lastSoundMs = 0;
  }

  silenceElapsed(tMs: number): number {
    return this.state === 'active' ? tMs - this.lastSoundMs : 0;
  }

  /** Procesa un bloque de analisis. tMs = reloj de audio en ms. */
  push(tMs: number, rmsDb: number, peakDb: number): DetectorEvent | null {
    // El pico aporta sensibilidad a transitorios (golpes, ataques) sin disparar con ruido continuo.
    const level = Math.max(rmsDb, peakDb - 12);
    const { on, off } = this.thresholds;

    switch (this.state) {
      case 'idle':
        if (level >= on) {
          this.state = 'candidate';
          this.onsetMs = tMs;
          break;
        }
        // El suelo de ruido solo se aprende en reposo (media exponencial lenta).
        if (rmsDb > -120) {
          this.noiseFloorDb = this.noiseFloorDb <= -90 ? rmsDb : this.noiseFloorDb + FLOOR_ALPHA * (rmsDb - this.noiseFloorDb);
        }
        break;
      case 'candidate':
        if (level < off) {
          this.state = 'idle';
          break;
        }
        if (tMs - this.onsetMs >= this.cfg.minActivityMs) {
          this.state = 'active';
          this.lastSoundMs = tMs;
          return { type: 'start', onsetMs: this.onsetMs, atMs: tMs };
        }
        break;
      case 'active':
        if (level >= off) {
          this.lastSoundMs = tMs;
        } else if (tMs - this.lastSoundMs >= this.cfg.silenceMs) {
          this.state = 'idle';
          return { type: 'end', lastSoundMs: this.lastSoundMs, atMs: tMs };
        }
        break;
    }
    return null;
  }
}
