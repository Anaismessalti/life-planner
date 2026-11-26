import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Feuille modale : glisse du bas sur iPhone, centrée sur iPad / Mac. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true">
      <div className="anim-fade absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-cream shadow-lift md:rounded-3xl ${
          wide ? 'md:max-w-2xl' : 'md:max-w-lg'
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-mauve/50 md:hidden" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="h-title text-2xl">{title}</h2>
          <button className="icon-btn -mr-2" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-soft">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm"
    >
      <span>{label}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-rasp' : 'bg-mauve/40'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={`seg ${className}`} role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, className = '', color }: { value: number; className?: string; color?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-blush ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${v}%`, background: color || 'linear-gradient(90deg, rgb(var(--c-mauve)), rgb(var(--c-rasp)))' }}
      />
    </div>
  );
}

export function Ring({ value, size = 76, label }: { value: number; size?: number; label?: ReactNode }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ringg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--c-mauve))" />
            <stop offset="1" stopColor="rgb(var(--c-rasp))" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-blush))" strokeWidth={8} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringg)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * v) / 100}
          style={{ transition: 'stroke-dashoffset .8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{label ?? <span className="font-semibold text-plum">{v}%</span>}</div>
    </div>
  );
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-mauve/50 px-4 py-6 text-center text-sm text-soft">
      {icon}
      {children}
    </div>
  );
}

/** Bouton de confirmation en deux temps (pas de fenêtre système). */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Confirmer ?',
  className = 'btn-danger',
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          t.current = setTimeout(() => setArmed(false), 3000);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

export function Section({ title, action, children, className = '' }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`anim-rise space-y-2.5 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl font-semibold text-plum">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---- Petites notifications « toast » ----
type ToastMsg = { id: number; text: string; action?: { label: string; run: () => void } };
let toasts: ToastMsg[] = [];
const tsubs = new Set<() => void>();
export function toast(text: string, action?: ToastMsg['action']) {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, text, action }];
  tsubs.forEach((f) => f());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    tsubs.forEach((f) => f());
  }, 4000);
}
export function Toasts() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    tsubs.add(f);
    return () => {
      tsubs.delete(f);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <div key={t.id} className="anim-rise pointer-events-auto flex items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-sm text-cream shadow-lift">
          {t.text}
          {t.action && (
            <button
              className="font-semibold text-mauve"
              onClick={() => {
                t.action!.run();
                toasts = toasts.filter((x) => x.id !== t.id);
                tsubs.forEach((f) => f());
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
