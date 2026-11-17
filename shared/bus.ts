// Canal de difusion entre paginas de la extension (offscreen, popup, side panel).
// BroadcastChannel evita despertar al service worker con cada fotograma de visualizacion.
import type { BusMessage } from './types';
import type { AppSettings } from './settings';

export const BUS_NAME = 'acs-bus';

export function openBus(): BroadcastChannel {
  return new BroadcastChannel(BUS_NAME);
}

export type Command =
  | { target: 'background'; type: 'start-session'; tabId: number }
  | { target: 'background'; type: 'stop-session' }
  | { target: 'offscreen'; type: 'start-recording' }
  | { target: 'offscreen'; type: 'pause' }
  | { target: 'offscreen'; type: 'resume' }
  | { target: 'offscreen'; type: 'finalize-segment' }
  | { target: 'offscreen'; type: 'settings-changed'; settings: AppSettings }
  | { target: 'offscreen'; type: 'reset' };

export interface CommandResult {
  ok: boolean;
  error?: string;
}

export async function sendCommand(cmd: Command): Promise<CommandResult> {
  try {
    const r = (await chrome.runtime.sendMessage(cmd)) as CommandResult | undefined;
    return r ?? { ok: false, error: 'Sin respuesta del motor de captura' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function isBusMessage(m: unknown): m is BusMessage {
  return typeof m === 'object' && m !== null && 'k' in m;
}
