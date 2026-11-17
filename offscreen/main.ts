// Documento offscreen: motor persistente de captura. Sobrevive al cierre del popup/side panel
// y a la suspension del service worker.
import { SessionController, type StartParams } from '../recording/session';
import type { AppSettings } from '../shared/settings';

type OffscreenMessage =
  | { target: 'offscreen'; type: 'start'; params: StartParams }
  | { target: 'offscreen'; type: 'stop'; reason?: 'user' | 'source-closed' }
  | { target: 'offscreen'; type: 'start-recording' | 'pause' | 'resume' | 'finalize-segment' | 'reset' }
  | { target: 'offscreen'; type: 'settings-changed'; settings: AppSettings };

const session = new SessionController(chrome.runtime.getURL('meter-processor.js'));

function reply(p: Promise<unknown>, sendResponse: (r: unknown) => void): true {
  p.then(() => sendResponse({ ok: true })).catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  return true;
}

chrome.runtime.onMessage.addListener((msg: OffscreenMessage, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return undefined;
  switch (msg.type) {
    case 'start':
      return reply(session.start(msg.params), sendResponse);
    case 'stop':
      return reply(session.stop(msg.reason ?? 'user'), sendResponse);
    case 'start-recording':
      return reply(session.startManual(), sendResponse);
    case 'finalize-segment':
      return reply(session.finalizeSegment(), sendResponse);
    case 'pause':
      session.pause();
      sendResponse({ ok: true });
      return undefined;
    case 'resume':
      session.resume();
      sendResponse({ ok: true });
      return undefined;
    case 'reset':
      session.reset();
      sendResponse({ ok: true });
      return undefined;
    case 'settings-changed':
      session.applySettings(msg.settings);
      sendResponse({ ok: true });
      return undefined;
  }
  return undefined;
});

void chrome.runtime.sendMessage({ target: 'background', type: 'offscreen-ready' }).catch(() => undefined);
