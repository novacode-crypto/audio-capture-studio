// Perfiles de deteccion (sin dependencias de la API chrome, reutilizable en la web).
import type { DetectionSettings, ProfileId } from './types';

export type ProfileValues = Omit<DetectionSettings, 'profile' | 'sensitivity' | 'adaptive'>;

export const PROFILES: Record<Exclude<ProfileId, 'custom'>, ProfileValues & { label: string; hint: string }> = {
  voice: {
    label: 'Voz',
    hint: 'Dialogos, podcasts y videos hablados. Filtra graves y agudos extremos del analisis.',
    onDb: -42, offDb: -50, minActivityMs: 120, silenceMs: 1000, prebufferMs: 500, hpHz: 90, lpHz: 6000,
  },
  music: {
    label: 'Musica',
    hint: 'Musica y pasajes suaves. Analisis de banda completa y silencio mas tolerante.',
    onDb: -50, offDb: -58, minActivityMs: 200, silenceMs: 2000, prebufferMs: 250, hpHz: 20, lpHz: 20000,
  },
  general: {
    label: 'Audio general',
    hint: 'Valores equilibrados para cualquier contenido.',
    onDb: -46, offDb: -54, minActivityMs: 100, silenceMs: 1000, prebufferMs: 500, hpHz: 30, lpHz: 20000,
  },
};

