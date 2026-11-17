import { useCallback, useEffect, useState } from 'react';
import { sendCommand, type CommandResult } from './bus';
import { capturability } from './tabs';
import type { Phase, SessionState } from './types';

export const PHASE_META: Record<Phase, { label: string; tone: 'neutral' | 'wait' | 'rec' | 'silence' | 'proc' | 'done'; desc: string }> = {
  idle: { label: 'Inactivo', tone: 'neutral', desc: 'Seleccione una pestana e inicie la monitorizacion.' },
  starting: { label: 'Iniciando', tone: 'proc', desc: 'Conectando con la pestana de origen...' },
  waiting: { label: 'Esperando audio', tone: 'wait', desc: 'Monitorizacion activa. No se graba hasta detectar sonido.' },
  recording: { label: 'Grabando', tone: 'rec', desc: 'Actividad sonora detectada: segmento en curso.' },
  silence: { label: 'Detectando silencio', tone: 'silence', desc: 'Posible final del segmento: se confirma si el silencio se sostiene.' },
  processing: { label: 'Procesando', tone: 'proc', desc: 'Finalizando el segmento y guardandolo en la biblioteca.' },
  completed: { label: 'Completado', tone: 'done', desc: 'Segmento disponible en la biblioteca.' },
  paused: { label: 'En pausa', tone: 'silence', desc: 'Grabacion manual en pausa. El analisis visual continua.' },
  error: { label: 'Error', tone: 'rec', desc: 'No se pudo completar la operacion.' },
};

export function faviconUrl(pageUrl: string, size = 32): string {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(size));
  return u.toString();
}

/** Inicio de captura. Chromium exige que la extension haya sido invocada en la pestana (activeTab). */
export async function startCapture(tab: chrome.tabs.Tab): Promise<CommandResult> {
  const cap = capturability(tab);
  if (!cap.ok || tab.id === undefined) return { ok: false, error: cap.reason ?? 'Pestana no valida' };
  return sendCommand({ target: 'background', type: 'start-session', tabId: tab.id });
}

const KEY = 'selectedTabId';

/** Pestana seleccionada (persistente). Durante una sesion se muestra siempre la pestana capturada. */
export function useSelectedTab(session: SessionState): { tab: chrome.tabs.Tab | null; select: (id: number) => Promise<void>; refresh: () => void } {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const wanted = session.active && session.tab ? session.tab.id : ((await chrome.storage.local.get(KEY))[KEY] as number | undefined);
      if (wanted === undefined) return alive && setTab(null);
      const t = await chrome.tabs.get(wanted).catch(() => null);
      if (alive) setTab(t);
    })();
    return () => {
      alive = false;
    };
  }, [session.active, session.tab, tick]);

  useEffect(() => {
    const onUpd = (id: number) => id === tab?.id && refresh();
    const onRm = (id: number) => id === tab?.id && refresh();
    chrome.tabs.onUpdated.addListener(onUpd);
    chrome.tabs.onRemoved.addListener(onRm);
    return () => {
      chrome.tabs.onUpdated.removeListener(onUpd);
      chrome.tabs.onRemoved.removeListener(onRm);
    };
  }, [tab?.id, refresh]);

  const select = useCallback(async (id: number) => {
    await chrome.storage.local.set({ [KEY]: id });
    refresh();
  }, [refresh]);

  return { tab, select, refresh };
}
