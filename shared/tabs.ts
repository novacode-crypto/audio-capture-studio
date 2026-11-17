import { domainOf } from './format';
import type { TabInfo } from './types';

const BLOCKED_PREFIXES = ['chrome://', 'edge://', 'brave://', 'opera://', 'vivaldi://', 'about:', 'view-source:', 'devtools://', 'chrome-extension://', 'chrome-search://', 'chrome-untrusted://'];
const BLOCKED_HOSTS = ['chrome.google.com/webstore', 'chromewebstore.google.com', 'microsoftedge.microsoft.com/addons'];

export function capturability(tab: { url?: string; id?: number }): { ok: boolean; reason?: string } {
  const url = tab.url ?? '';
  if (tab.id === undefined || tab.id < 0) return { ok: false, reason: 'Pestana no valida' };
  if (!url) return { ok: false, reason: 'Sin URL accesible' };
  if (BLOCKED_PREFIXES.some((p) => url.startsWith(p))) return { ok: false, reason: 'Pagina interna del navegador: Chromium no permite capturarla' };
  if (BLOCKED_HOSTS.some((h) => url.replace(/^https?:\/\//, '').startsWith(h))) return { ok: false, reason: 'Tienda de extensiones: pagina protegida' };
  if (!/^(https?|file|ftp):/.test(url)) return { ok: false, reason: 'Esquema de URL no compatible' };
  return { ok: true };
}

export function toTabInfo(tab: chrome.tabs.Tab): TabInfo {
  return {
    id: tab.id ?? -1,
    title: tab.title ?? '',
    url: tab.url ?? '',
    domain: domainOf(tab.url ?? ''),
    favIconUrl: tab.favIconUrl,
  };
}
