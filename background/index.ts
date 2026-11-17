// Service worker MV3: coordina sesion, permisos e identificadores de captura.
// El motor de audio vive en el documento offscreen; el service worker puede suspenderse sin perder la captura.
import { loadSettings } from '../shared/settings';
import { capturability, toTabInfo } from '../shared/tabs';

const OFFSCREEN_URL = 'offscreen.html';
const SESSION_KEY = 'activeSession';

interface BgMessage {
  target?: string;
  type?: string;
  tabId?: number;
}

async function hasOffscreen(): Promise<boolean> {
  const ctxs = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  return ctxs.length > 0;
}

let creating: Promise<void> | null = null;
async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Procesar y grabar el audio de la pestana seleccionada mientras el usuario navega por otras pestanas.',
      })
      .finally(() => {
        creating = null;
      });
  }
  await creating;
}

async function toOffscreen<T = { ok: boolean; error?: string }>(msg: Record<string, unknown>): Promise<T | undefined> {
  return (await chrome.runtime.sendMessage({ target: 'offscreen', ...msg })) as T | undefined;
}

async function startSession(tabId: number): Promise<{ ok: boolean; error?: string }> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return { ok: false, error: 'La pestana seleccionada ya no existe' };
  const cap = capturability(tab);
  if (!cap.ok) return { ok: false, error: cap.reason };
  const stored = await chrome.storage.session.get(SESSION_KEY);
  if (stored[SESSION_KEY] && (await hasOffscreen())) {
    return { ok: false, error: 'Ya hay una sesion de captura activa. Detengala antes de iniciar otra.' };
  }
  let streamId: string;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: /not been invoked|activeTab/i.test(msg)
        ? 'Chromium solo permite capturar una pestana despues de invocar la extension en ella. Cambie a esa pestana, pulse el icono de AUDIO CAPTURE STUDIO y pulse Iniciar en el popup (o vuelva a abrir el popup en esa pestana y regrese aqui).'
        : /Cannot capture|already|being captured/i.test(msg)
          ? 'La pestana ya esta siendo capturada por otra herramienta o sesion.'
          : msg,
    };
  }
  await ensureOffscreen();
  const settings = await loadSettings();
  const res = await toOffscreen({ type: 'start', params: { streamId, tab: toTabInfo(tab), settings } });
  if (!res?.ok) return { ok: false, error: res?.error ?? 'El motor de captura no respondio' };
  await chrome.storage.session.set({ [SESSION_KEY]: { tabId, startedAt: Date.now() } });
  return { ok: true };
}

async function stopSession(reason: 'user' | 'source-closed' = 'user'): Promise<{ ok: boolean; error?: string }> {
  await chrome.storage.session.remove(SESSION_KEY);
  if (!(await hasOffscreen())) return { ok: true };
  const res = await toOffscreen({ type: 'stop', reason });
  return res ?? { ok: true };
}

chrome.runtime.onMessage.addListener((msg: BgMessage, _sender, sendResponse) => {
  if (!msg || msg.target !== 'background') return undefined;
  if (msg.type === 'start-session' && typeof msg.tabId === 'number') {
    startSession(msg.tabId).then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  }
  if (msg.type === 'stop-session') {
    stopSession().then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  }
  return undefined;
});

// Pestana de origen cerrada: finaliza y guarda lo grabado hasta ese momento.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const r = await chrome.storage.session.get(SESSION_KEY);
  if ((r[SESSION_KEY] as { tabId?: number } | undefined)?.tabId === tabId) await stopSession('source-closed');
});

// Al reiniciar el navegador no queda ninguna captura viva: limpiar marcas de sesion.
chrome.runtime.onStartup.addListener(() => {
  void chrome.storage.session.remove(SESSION_KEY);
});

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
});
