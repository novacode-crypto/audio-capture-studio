import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const DelayContext = createContext(450);
export const TooltipDelayProvider = DelayContext.Provider;

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TipProps {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  delay?: number;
  /** Texto secundario (informacion contextual). */
  hint?: ReactNode;
  className?: string;
  disabled?: boolean;
}

const GAP = 8;
const MARGIN = 8;

function Bubble({ anchor, side, id, content, hint }: { anchor: HTMLElement; side: Side; id: string; content: ReactNode; hint?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; side: Side; ax: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = anchor.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const room = {
      top: a.top - GAP - MARGIN,
      bottom: vh - a.bottom - GAP - MARGIN,
      left: a.left - GAP - MARGIN,
      right: vw - a.right - GAP - MARGIN,
    };
    let s = side;
    const need = s === 'top' || s === 'bottom' ? b.height : b.width;
    if (room[s] < need) {
      const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
      s = room[opposite[s]] >= need ? opposite[s] : (Object.keys(room) as Side[]).sort((p, q) => room[q] - room[p])[0];
    }
    let x: number;
    let y: number;
    if (s === 'top' || s === 'bottom') {
      x = a.left + a.width / 2 - b.width / 2;
      y = s === 'top' ? a.top - b.height - GAP : a.bottom + GAP;
      x = Math.max(MARGIN, Math.min(x, vw - b.width - MARGIN));
    } else {
      y = a.top + a.height / 2 - b.height / 2;
      x = s === 'left' ? a.left - b.width - GAP : a.right + GAP;
      y = Math.max(MARGIN, Math.min(y, vh - b.height - MARGIN));
    }
    setPos({ x, y, side: s, ax: a.left + a.width / 2 - x });
  }, [anchor, side, content, hint]);

  const shift = pos?.side === 'top' ? '3px' : pos?.side === 'bottom' ? '-3px' : '0';
  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      style={{
        position: 'fixed',
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        visibility: pos ? 'visible' : 'hidden',
        ['--tip-shift' as string]: shift,
        animation: pos ? 'acs-tip-in 0.14s ease-out' : undefined,
      }}
      className="pointer-events-none z-[1000] max-w-[240px] rounded-sm bg-[var(--tip-bg)] px-2 py-1.5 text-xs leading-snug text-[var(--tip-fg)] shadow-pop"
    >
      <div className="font-medium">{content}</div>
      {hint ? <div className="mt-0.5 opacity-75">{hint}</div> : null}
      {pos && (pos.side === 'top' || pos.side === 'bottom') ? (
        <span
          aria-hidden
          style={{ left: Math.max(8, Math.min(pos.ax, (ref.current?.offsetWidth ?? 40) - 8)) - 4 }}
          className={`absolute h-2 w-2 rotate-45 bg-[var(--tip-bg)] ${pos.side === 'top' ? '-bottom-1' : '-top-1'}`}
        />
      ) : null}
    </div>,
    document.body,
  );
}

/** Sistema propio de tooltips: retardo configurable, posicionamiento inteligente, sin title nativo. */
export function Tip({ content, children, side = 'top', delay, hint, className, disabled }: TipProps) {
  const ctxDelay = useContext(DelayContext);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay ?? ctxDelay);
  }, [delay, ctxDelay]);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
    };
  }, [open, hide]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (disabled) return <>{children}</>;
  return (
    <span
      ref={ref}
      className={className ?? 'inline-flex'}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onMouseDown={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && ref.current ? <Bubble anchor={ref.current} side={side} id={id} content={content} hint={hint} /> : null}
    </span>
  );
}
