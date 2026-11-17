import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, XCircle } from 'lucide-react';
import { cn } from './cn';
import { Button } from './ui';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** false = no se cierra con Escape ni con clic fuera (p. ej. operaciones en curso). */
  dismissable?: boolean;
}

/** Modal accesible: role=dialog, foco atrapado, restauracion de foco, cierre con Escape. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', dismissable = true }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab' && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
        if (!items.length) return e.preventDefault();
        const a = items[0];
        const z = items[items.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [open, dismissable]);

  if (!open) return null;
  return createPortal(
    <div className="acs-fade-in fixed inset-0 z-[900] flex items-end justify-center bg-[var(--scrim)] p-2 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'acs-pop-in flex max-h-[92vh] w-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-pop outline-none',
          size === 'sm' && 'max-w-[360px]',
          size === 'md' && 'max-w-[460px]',
          size === 'lg' && 'max-w-[560px]',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold leading-tight">{title}</h2>
            {description ? <p id={descId} className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          {dismissable ? (
            <button type="button" onClick={onClose} aria-label="Cerrar" className="-mr-1 rounded-sm p-1 text-faint transition-colors hover:bg-surface3 hover:text-fg">
              <X size={16} strokeWidth={2} />
            </button>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface2 px-4 py-2.5">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Dialogos imperativos (sustituyen a alert / confirm / prompt)
// ---------------------------------------------------------------------------
interface ConfirmOpts { title: string; message: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
interface PromptOpts { title: string; label: string; initial?: string; confirmLabel?: string; validate?: (v: string) => string | null }
interface ErrorOpts { title?: string; message: ReactNode; details?: string }

interface DialogApi {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
  error: (o: ErrorOpts) => Promise<void>;
}

type Active =
  | { kind: 'confirm'; o: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; o: PromptOpts; resolve: (v: string | null) => void }
  | { kind: 'error'; o: ErrorOpts; resolve: () => void };

const DialogCtx = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const c = useContext(DialogCtx);
  if (!c) throw new Error('DialogProvider ausente');
  return c;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Active | null>(null);
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const api: DialogApi = {
    confirm: useCallback((o) => new Promise((resolve) => setActive({ kind: 'confirm', o, resolve })), []),
    prompt: useCallback((o) => new Promise((resolve) => { setValue(o.initial ?? ''); setErr(null); setActive({ kind: 'prompt', o, resolve }); }), []),
    error: useCallback((o) => new Promise((resolve) => setActive({ kind: 'error', o, resolve })), []),
  };

  const close = () => setActive(null);
  let body: ReactNode = null;
  if (active?.kind === 'confirm') {
    const { o, resolve } = active;
    const done = (v: boolean) => { resolve(v); close(); };
    body = (
      <Modal open onClose={() => done(false)} size="sm" title={o.title}
        footer={<><Button variant="secondary" onClick={() => done(false)}>{o.cancelLabel ?? 'Cancelar'}</Button><Button variant={o.danger ? 'danger' : 'primary'} onClick={() => done(true)} data-autofocus>{o.confirmLabel ?? 'Aceptar'}</Button></>}>
        <div className="flex gap-3 text-base text-muted">
          {o.danger ? <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" /> : null}
          <div>{o.message}</div>
        </div>
      </Modal>
    );
  } else if (active?.kind === 'prompt') {
    const { o, resolve } = active;
    const submit = () => {
      const v = value.trim();
      const e = o.validate ? o.validate(v) : v ? null : 'Escriba un valor';
      if (e) return setErr(e);
      resolve(v);
      close();
    };
    body = (
      <Modal open onClose={() => { resolve(null); close(); }} size="sm" title={o.title}
        footer={<><Button variant="secondary" onClick={() => { resolve(null); close(); }}>Cancelar</Button><Button onClick={submit}>{o.confirmLabel ?? 'Guardar'}</Button></>}>
        <label className="block text-sm font-medium text-muted" htmlFor="acs-prompt">{o.label}</label>
        <input id="acs-prompt" data-autofocus value={value} onChange={(e) => { setValue(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="mt-1 w-full rounded-md border border-line2 bg-surface2 px-2.5 py-1.5 text-base outline-none focus:border-primary" />
        {err ? <p className="mt-1 text-sm text-danger">{err}</p> : null}
      </Modal>
    );
  } else if (active?.kind === 'error') {
    const { o, resolve } = active;
    body = (
      <Modal open onClose={() => { resolve(); close(); }} size="sm" title={o.title ?? 'Se ha producido un error'}
        footer={<Button onClick={() => { resolve(); close(); }} data-autofocus>Entendido</Button>}>
        <div className="flex gap-3">
          <XCircle size={20} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0 text-base text-muted">
            <div>{o.message}</div>
            {o.details ? <pre className="num mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-sm bg-surface2 p-2 text-xs text-faint">{o.details}</pre> : null}
          </div>
        </div>
      </Modal>
    );
  }
  return <DialogCtx.Provider value={api}>{children}{body}</DialogCtx.Provider>;
}
