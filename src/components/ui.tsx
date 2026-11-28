import { X } from 'lucide-react';
import { Component, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
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

/** Champ de formulaire. `group` : pour un groupe de boutons (pas de <label>, sinon un toucher dans le vide active le premier bouton). */
export function Field({ label, children, hint, group }: { label: string; children: ReactNode; hint?: string; group?: boolean }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="block space-y-1.5" {...(group ? { role: 'group', 'aria-label': label } : {})}>
      <span className="label block">{label}</span>
      {children}
      {hint && <span className="block text-xs text-soft">{hint}</span>}
    </Tag>
  );
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/**
 * Choix d'un mois (YYYY-MM) qui fonctionne partout : le champ natif « mois » n'existe pas
 * dans Safari sur Mac et donnait une valeur invalide. Années illimitées (projets sur plusieurs années).
 */
export function MonthPicker({ value, onChange, placeholder = 'Choisir un mois', testid }: { value?: string; onChange: (v: string | undefined) => void; placeholder?: string; testid?: string }) {
  const valid = !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  const nowY = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(valid ? Number(value!.slice(0, 4)) : nowY);
  const label = valid ? `${MONTHS_LONG[Number(value!.slice(5, 7)) - 1]} ${value!.slice(0, 4)}` : placeholder;
  return (
    <div className="space-y-2" data-testid={testid}>
      <div className="flex gap-2">
        <button type="button" className={`input flex-1 text-left ${valid ? '' : 'text-soft'}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid={testid ? `${testid}-toggle` : undefined}>
          {label}
        </button>
        {valid && (
          <button type="button" className="icon-btn shrink-0" onClick={() => onChange(undefined)} aria-label="Effacer le mois">
            <X size={16} />
          </button>
        )}
      </div>
      {open && (
        <div className="anim-rise rounded-2xl border border-line bg-card p-2">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="icon-btn h-9 w-9" onClick={() => setYear((y) => y - 1)} aria-label="Année précédente">‹</button>
            <span className="font-serif text-lg font-semibold text-plum" data-testid={testid ? `${testid}-year` : undefined}>{year}</span>
            <button type="button" className="icon-btn h-9 w-9" onClick={() => setYear((y) => y + 1)} aria-label="Année suivante">›</button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS_SHORT.map((m, i) => {
              const v = `${year}-${String(i + 1).padStart(2, '0')}`;
              return (
                <button
                  type="button"
                  key={m}
                  className={`rounded-xl py-2.5 text-sm ${v === value ? 'bg-rasp font-semibold text-white' : 'text-ink hover:bg-blush'}`}
                  onClick={() => {
                    onChange(v);
                    setOpen(false);
                  }}
                  aria-label={`${MONTHS_LONG[i]} ${year}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Évite l'écran blanc : si une page plante, on l'affiche proprement sans toucher aux données. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('Erreur d’affichage', error);
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card mx-auto mt-10 max-w-md space-y-3 p-6 text-center" data-testid="error-boundary">
        <div className="h-title text-2xl">Oups, cet écran a eu un souci</div>
        <p className="text-sm text-soft">Tes données sont intactes. Tu peux revenir à l’accueil ou recharger l’application.</p>
        <p className="break-words text-xs text-soft/70">{String(this.state.error.message || this.state.error)}</p>
        <div className="flex justify-center gap-2">
          <button className="btn-soft" onClick={() => { location.hash = '#/today'; this.setState({ error: undefined }); }}>Accueil</button>
          <button className="btn-primary" onClick={() => location.reload()}>Recharger</button>
        </div>
      </div>
    );
  }
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
  // Un seul toast à la fois (le plus récent) : ils ne s'empilent plus par-dessus les formulaires.
  toasts = [{ id, text, action }];
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
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

/**
 * Zone de texte qui grandit avec ce qu'on écrit : tout reste lisible, sans barre de défilement intérieure.
 * Un retour à la ligne est permis ; la hauteur suit le texte (au moins `rows` lignes).
 */
export const GrowText = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function GrowText({ className = '', rows = 2, value, ...rest }, outer) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outer, () => ref.current!);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    // Rotation, clavier, changement de largeur : la hauteur suit.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fit()) : undefined;
    if (ref.current && ro) ro.observe(ref.current);
    return () => ro?.disconnect();
  }, []);
  return <textarea ref={ref} rows={rows} value={value} onInput={fit} className={`input grow-text ${className}`} {...rest} />;
});

/**
 * Champ libre enregistré tout seul : pendant la frappe (une demi-seconde après), en quittant le champ,
 * en fermant le panneau ou en passant à une autre app. Rien ne se perd.
 */
export function SavedText({ value, onSave, delay = 500, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'defaultValue'> & { value?: string; onSave: (v: string) => void; delay?: number }) {
  const [v, setV] = useState(value || '');
  const pending = useRef<string | null>(null);
  const timer = useRef<number>();
  const save = useRef(onSave);
  save.current = onSave;
  const flush = () => {
    window.clearTimeout(timer.current);
    if (pending.current === null) return;
    const val = pending.current;
    pending.current = null;
    save.current(val);
  };
  useEffect(() => {
    if (pending.current === null) setV(value || '');
  }, [value]);
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  return (
    <GrowText
      {...rest}
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        pending.current = e.target.value;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, delay);
      }}
      onBlur={(e) => {
        flush();
        rest.onBlur?.(e);
      }}
    />
  );
}
