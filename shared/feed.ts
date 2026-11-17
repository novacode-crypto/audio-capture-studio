// Cliente del canal de difusion para paginas de UI (popup / side panel).
import { openBus } from './bus';
import { IDLE_STATE, type BusMessage, type SessionState, type VizFrame } from './types';

type Level = 'info' | 'success' | 'warn' | 'error';
type Fn<T> = (v: T) => void;

class Feed {
  private bus = openBus();
  state: SessionState = IDLE_STATE;
  private states = new Set<Fn<SessionState>>();
  private frames = new Set<Fn<VizFrame>>();
  private events = new Set<Fn<{ level: Level; text: string }>>();
  private libs = new Set<() => void>();
  private timer: number | undefined;

  constructor() {
    this.bus.onmessage = (e: MessageEvent<BusMessage>) => {
      const m = e.data;
      switch (m.k) {
        case 'state':
          this.state = m.state;
          this.states.forEach((f) => f(m.state));
          break;
        case 'frame':
          this.frames.forEach((f) => f(m));
          break;
        case 'event':
          this.events.forEach((f) => f({ level: m.level, text: m.text }));
          break;
        case 'library':
          this.libs.forEach((f) => f());
          break;
      }
    };
    this.bus.postMessage({ k: 'hello' });
    this.timer = window.setInterval(() => this.bus.postMessage({ k: 'sub' }), 1500);
    window.addEventListener('pagehide', () => window.clearInterval(this.timer));
  }

  onState(f: Fn<SessionState>): () => void {
    this.states.add(f);
    return () => void this.states.delete(f);
  }
  onFrame(f: Fn<VizFrame>): () => void {
    this.frames.add(f);
    return () => void this.frames.delete(f);
  }
  onEvent(f: Fn<{ level: Level; text: string }>): () => void {
    this.events.add(f);
    return () => void this.events.delete(f);
  }
  onLibrary(f: () => void): () => void {
    this.libs.add(f);
    return () => void this.libs.delete(f);
  }
  hello(): void {
    this.bus.postMessage({ k: 'hello' });
  }
}

let instance: Feed | null = null;
export function getFeed(): Feed {
  if (!instance) instance = new Feed();
  return instance;
}
