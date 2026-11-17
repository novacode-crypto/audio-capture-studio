import { useCallback, useEffect, useRef, useState } from 'react';
import { getFeed } from './feed';
import { DEFAULT_SETTINGS, deepMerge, loadSettings, onSettingsChanged, saveSettings, type AppSettings } from './settings';
import type { SessionState, VizFrame } from './types';

export function useSettings(): [AppSettings, (patch: (s: AppSettings) => AppSettings) => void, boolean] {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const ref = useRef(settings);
  ref.current = settings;
  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setReady(true);
    });
    return onSettingsChanged((s) => setSettings(s));
  }, []);
  const update = useCallback((fn: (s: AppSettings) => AppSettings) => {
    const next = deepMerge(DEFAULT_SETTINGS, fn(ref.current));
    ref.current = next;
    setSettings(next);
    void saveSettings(next);
  }, []);
  return [settings, update, ready];
}

export function useSession(): SessionState {
  const feed = getFeed();
  const [state, setState] = useState<SessionState>(feed.state);
  useEffect(() => {
    setState(feed.state);
    const off = feed.onState(setState);
    feed.hello();
    return off;
  }, [feed]);
  return state;
}

/** Reloj local para cronometros calculados con timestamps reales (no acumulan errores). */
export function useNow(active: boolean, intervalMs = 200): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [active, intervalMs]);
  return now;
}

/** Ultimo fotograma de medicion, actualizado a ~8 Hz para valores numericos. */
export function useLevels(enabled: boolean): VizFrame | null {
  const [frame, setFrame] = useState<VizFrame | null>(null);
  const last = useRef<VizFrame | null>(null);
  useEffect(() => {
    if (!enabled) {
      setFrame(null);
      return;
    }
    const off = getFeed().onFrame((f) => {
      last.current = f;
    });
    const t = window.setInterval(() => setFrame(last.current), 120);
    return () => {
      off();
      window.clearInterval(t);
    };
  }, [enabled]);
  return enabled ? frame : null;
}

export function applyTheme(theme: AppSettings['theme']): void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const set = () => {
    const dark = theme === 'dark' || (theme === 'system' && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  };
  set();
}

export function useTheme(theme: AppSettings['theme']): void {
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => applyTheme('system');
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [theme]);
}
