import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from './cn';

export type ToastLevel = 'info' | 'success' | 'warn' | 'error';
interface ToastItem { id: number; level: ToastLevel; text: string; duration: number }
interface ToastApi { push: (level: ToastLevel, text: string, duration?: number) => void }

const Ctx = createContext<ToastApi | null>(null);
export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('ToastProvider ausente');
  return c;
}

const ICON = { info: Info, success: CheckCircle2, warn: AlertTriangle, error: XCircle };
const TONE: Record<ToastLevel, string> = {
  info: 'text-wait',
  success: 'text-done',
  warn: 'text-silence',
  error: 'text-rec',
};

function Toast({ t, onClose }: { t: ToastItem; onClose: () => void }) {
  const Icon = ICON[t.level];
  const timer = useRef<number | undefined>(undefined);
  const start = useCallback(() => {
    timer.current = window.setTimeout(onClose, t.duration);
  }, [onClose, t.duration]);
  useEffect(() => {
    start();
    return () => window.clearTimeout(timer.current);
  }, [start]);
  return (
    <div
      role={t.level === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => window.clearTimeout(timer.current)}
      onMouseLeave={start}
      style={{ animation: 'acs-toast-in 0.2s ease-out' }}
      className="pointer-events-auto flex items-start gap-2.5 rounded-md border border-line bg-surface px-3 py-2 shadow-pop"
    >
      <Icon size={16} className={cn('mt-0.5 shrink-0', TONE[t.level])} strokeWidth={2.2} />
      <p className="min-w-0 flex-1 text-sm leading-snug">{t.text}</p>
      <button type="button" onClick={onClose} aria-label="Cerrar notificacion" className="-mr-1 rounded-sm p-0.5 text-faint hover:text-fg">
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((level: ToastLevel, text: string, duration = level === 'error' ? 7000 : 3600) => {
    const id = ++seq.current;
    setItems((cur) => [...cur.filter((c) => c.text !== text).slice(-3), { id, level, text, duration }]);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      {createPortal(
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-3 z-[1100] mx-auto flex w-full max-w-[420px] flex-col gap-2 px-3">
          {items.map((t) => (
            <Toast key={t.id} t={t} onClose={() => setItems((cur) => cur.filter((c) => c.id !== t.id))} />
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}
