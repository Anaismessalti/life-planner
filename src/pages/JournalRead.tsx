// « Relire » : le fil de ses journées, comme un carnet qu'on feuillette. Tout le texte, en entier, et une recherche.
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Camera, PenLine, Search, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useDayPhoto } from '../components/Memories';
import { Empty } from '../components/ui';
import { db } from '../db/db';
import type { Contact, DayLog, ISODate, Tracker } from '../db/types';
import { capitalize, fmt } from '../lib/dates';
import { MOODS } from '../lib/journal';
import { readDay, rereadDays, splitMatches, type ReadDay } from '../lib/reread';
import { navigate } from '../lib/ui-store';

const PAGE = 15;

function Hl({ text, q }: { text: string; q: string }) {
  return (
    <>
      {splitMatches(text, q).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded bg-[#F5DFEC] px-0.5 text-plum">
            {p.s}
          </mark>
        ) : (
          <span key={i}>{p.s}</span>
        ),
      )}
    </>
  );
}

function Photo({ date }: { date: ISODate }) {
  const p = useDayPhoto(date);
  if (!p) return null;
  return <img src={p.data} alt="" loading="lazy" className="max-h-72 w-full rounded-2xl object-cover" data-testid="read-photo" />;
}

function DayCard({ d, q, photo }: { d: ReadDay; q: string; photo: boolean }) {
  const mood = d.mood ? MOODS[d.mood - 1] : undefined;
  const list = (title: string, lines: string[]) =>
    lines.length > 0 && (
      <div className="space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-soft">{title}</div>
        {lines.map((l, i) => (
          <p key={i} className="read-text text-[15px]">
            <span className="mr-1.5 font-serif text-soft">{i + 1}.</span>
            <Hl text={l} q={q} />
          </p>
        ))}
      </div>
    );
  return (
    <article className="card space-y-3 p-4" data-testid="read-day">
      <header className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-soft">{capitalize(fmt(d.date, 'EEEE d MMMM yyyy'))}</span>
        {mood && (
          <span className="shrink-0 font-serif text-base italic" style={{ color: mood.color }}>
            {mood.label}
          </span>
        )}
      </header>
      {d.title && (
        <h3 className="font-serif text-2xl font-semibold leading-tight text-plum">
          <Hl text={d.title} q={q} />
        </h3>
      )}
      {d.highlight && (
        <p className="read-text border-l-2 border-rasp/50 pl-3 font-serif text-[18px] italic text-plum">
          <Hl text={d.highlight} q={q} />
        </p>
      )}
      {photo && <Photo date={d.date} />}
      {d.text && (
        <p className="read-text text-[16px] text-ink" data-testid="read-text">
          <Hl text={d.text} q={q} />
        </p>
      )}
      {d.comments.length > 0 && (
        <div className="space-y-2" data-testid="read-comments">
          {d.comments.map((c) => (
            <div key={c.trackerId} className="flex gap-2.5">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-soft">
                  {c.name}
                  {c.with.length > 0 && <span className="normal-case tracking-normal"> · {c.with.join(', ')}</span>}
                </div>
                <p className="read-text text-[15px] text-ink">
                  <Hl text={c.detail} q={q} />
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {list('Gratitude', d.grateful)}
      {list('Belles choses', d.amazing)}
      {d.better && (
        <div className="space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wide text-soft">Pour faire encore mieux</div>
          <p className="read-text text-[15px]">
            <Hl text={d.better} q={q} />
          </p>
        </div>
      )}
      {d.win && (
        <p className="read-text text-[15px]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-soft">Réussite de la semaine · </span>
          <Hl text={d.win} q={q} />
        </p>
      )}
      <button className="btn-ghost -ml-2 py-1 text-xs" onClick={() => navigate('journal', d.date)} data-testid="read-open">
        <PenLine size={14} /> Compléter cette journée
      </button>
    </article>
  );
}

export function JournalRead({ logs, trackers, contacts }: { logs: DayLog[]; trackers: Tracker[]; contacts: Contact[] }) {
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [onlyPhotos, setOnlyPhotos] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const photoIds = useLiveQuery(async () => new Set((await db.photos.toArray()).filter((p) => !p.deleted).map((p) => p.id)), [], new Set<string>());
  const days = useMemo(() => {
    const tr = new Map(trackers.map((t) => [t.id, t]));
    const ct = new Map(contacts.map((c) => [c.id, c.name]));
    return logs.filter((l) => !l.deleted).map((l) => readDay(l, (id) => tr.get(id), (id) => ct.get(id)));
  }, [logs, trackers, contacts]);
  const found = useMemo(() => rereadDays(days, query, onlyPhotos ? (d) => photoIds.has(d.date) : undefined), [days, query, onlyPhotos, photoIds]);
  const visible = found.slice(0, shown);
  let month = '';
  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="journal-read">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-soft" />
        <input
          className="input pl-10 pr-10"
          type="search"
          placeholder="Chercher un mot, un prénom, un lieu…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(PAGE);
          }}
          aria-label="Chercher dans mon journal"
          data-testid="read-search"
        />
        {q && (
          <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-soft" onClick={() => setQ('')} aria-label="Effacer">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-soft" data-testid="read-count">
          {found.length} {found.length > 1 ? 'journées' : 'journée'}
          {query ? ` avec « ${query.trim()} »` : ' écrites'}
        </span>
        <button className={`chip text-xs ${onlyPhotos ? 'chip-on' : ''}`} onClick={() => setOnlyPhotos(!onlyPhotos)} aria-pressed={onlyPhotos} data-testid="read-photos">
          <Camera size={13} /> Avec photo
        </button>
      </div>
      {!found.length && (
        <Empty icon={<BookOpen size={20} />}>
          {query ? 'Aucune journée ne contient ces mots.' : 'Tes notes, tes moments forts et les commentaires de tes activités apparaîtront ici, en entier.'}
        </Empty>
      )}
      {visible.map((d) => {
        const m = d.date.slice(0, 7);
        const head = m !== month;
        month = m;
        return (
          <div key={d.date} className="space-y-2">
            {head && <h2 className="label pt-2">{capitalize(fmt(d.date, 'MMMM yyyy'))}</h2>}
            <DayCard d={d} q={query} photo={photoIds.has(d.date)} />
          </div>
        );
      })}
      {found.length > shown && (
        <button className="btn-soft w-full" onClick={() => setShown(shown + PAGE)} data-testid="read-more">
          Voir les journées d’avant ({found.length - shown})
        </button>
      )}
    </div>
  );
}
