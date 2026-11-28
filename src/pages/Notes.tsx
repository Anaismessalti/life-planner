import { ClipboardPaste, ExternalLink, Heart, ImagePlus, Plus, Search, StickyNote, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmButton, Empty, Field, GrowText, Sheet, toast } from '../components/ui';
import { create, update } from '../db/db';
import type { Note } from '../db/types';
import { fmt, toISO } from '../lib/dates';
import { useCollections, useNotes } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { PLATFORM_BG, PLATFORM_LABEL, compressImage, guessTitle, normalizeUrl, platformOf, safeHost } from '../lib/links';
import { closeEditor, openEditor } from '../lib/ui-store';

export function NotesPage() {
  const notes = useNotes();
  const cols = useCollections();
  const [q, setQ] = useState('');
  const [col, setCol] = useState<string>('all');
  const [tag, setTag] = useState<string | null>(null);
  const colMap = useMemo(() => new Map(cols.map((c) => [c.id, c])), [cols]);
  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes]);

  const filtered = notes.filter((n) => {
    if (col === 'fav' && !n.favorite) return false;
    if (col === 'links' && !n.url) return false;
    if (col !== 'all' && col !== 'fav' && col !== 'links' && n.collectionId !== col) return false;
    if (tag && !n.tags.includes(tag)) return false;
    if (q) {
      const hay = `${n.title} ${n.text || ''} ${n.url || ''} ${n.tags.join(' ')} ${colMap.get(n.collectionId || '')?.name || ''}`.toLowerCase();
      return q
        .toLowerCase()
        .split(/\s+/)
        .every((w) => hay.includes(w));
    }
    return true;
  });

  const pasteLink = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      const url = normalizeUrl(txt);
      if (!url) return toast('Aucun lien dans le presse-papiers');
      await create<Note>('notes', { title: guessTitle(url), url, tags: [], favorite: false, collectionId: col.startsWith('col-') || colMap.has(col) ? col : undefined } as any);
      toast('Lien enregistré');
    } catch {
      openEditor({ type: 'note', link: true });
    }
  };

  return (
    <div className="space-y-5">
      <header className="anim-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Ma bibliothèque</p>
          <h1 className="h-title text-4xl">Notes et inspirations</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn-soft" onClick={pasteLink}>
            <ClipboardPaste size={16} /> Coller un lien
          </button>
          <button className="btn-primary" onClick={() => openEditor({ type: 'note' })}>
            <Plus size={16} /> Note
          </button>
        </div>
      </header>

      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-soft" />
        <input className="input pl-10" placeholder="Rechercher une recette, un lieu, un mot-clé…" value={q} onChange={(e) => setQ(e.target.value)} type="search" aria-label="Rechercher" />
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[
          { id: 'all', name: 'Tout', icon: 'sparkles' },
          { id: 'fav', name: 'Favoris', icon: 'heart' },
          { id: 'links', name: 'Liens', icon: 'tag' },
          ...cols,
        ].map((c) => (
          <button key={c.id} className={`chip shrink-0 ${col === c.id ? 'chip-on' : ''}`} onClick={() => setCol(c.id)}>
            <Icon name={c.icon} size={14} /> {c.name}
          </button>
        ))}
      </div>
      {allTags.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {allTags.map((t) => (
            <button key={t} className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${tag === t ? 'bg-plum text-white' : 'bg-blush text-plum'}`} onClick={() => setTag(tag === t ? null : t)}>
              #{t}
            </button>
          ))}
        </div>
      )}

      {!filtered.length && (
        <Empty icon={<StickyNote size={22} />}>
          {notes.length ? 'Aucun résultat.' : 'Recettes, restaurants, idées déco, liens TikTok ou Instagram : tout ici, joliment rangé.'}
        </Empty>
      )}
      <div className="masonry">
        {filtered.map((n) => (
          <NoteCard key={n.id} n={n} colName={colMap.get(n.collectionId || '')?.name} />
        ))}
      </div>
    </div>
  );
}

function NoteCard({ n, colName }: { n: Note; colName?: string }) {
  const p = platformOf(n.url);
  return (
    <div className="anim-rise card group overflow-hidden" data-testid="note-card">
      <button className="block w-full text-left" onClick={() => openEditor({ type: 'note', id: n.id })}>
        {n.image ? (
          <img src={n.image} alt="" className="w-full object-cover" loading="lazy" />
        ) : n.url ? (
          <div className="flex h-24 items-end p-3" style={{ background: PLATFORM_BG[p] }}>
            <span className="rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-plum">{p === 'web' ? safeHost(n.url) : PLATFORM_LABEL[p]}</span>
          </div>
        ) : null}
        <div className="space-y-1.5 p-3.5">
          <div className="font-serif text-lg font-semibold leading-snug text-plum">{n.title}</div>
          {n.text && <p className="line-clamp-6 whitespace-pre-line text-sm text-ink/80">{n.text}</p>}
          <div className="flex flex-wrap gap-1">
            {n.tags.map((t) => (
              <span key={t} className="rounded-full bg-blush px-2 py-0.5 text-[11px] text-plum">
                #{t}
              </span>
            ))}
          </div>
          <div className="text-[11px] text-soft">
            {colName ? `${colName} · ` : ''}
            {fmt(toISO(new Date(n.createdAt)), 'd MMM yyyy')}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-1 border-t border-line/60 px-2 py-1">
        <button className="icon-btn h-9 w-9" onClick={() => update<Note>('notes', n.id, { favorite: !n.favorite })} aria-label={n.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
          <Heart size={17} className={n.favorite ? 'fill-rasp text-rasp' : ''} />
        </button>
        {n.url && (
          <a href={n.url} target="_blank" rel="noopener noreferrer" className="icon-btn ml-auto h-9 w-9" aria-label="Ouvrir le lien">
            <ExternalLink size={17} />
          </a>
        )}
      </div>
    </div>
  );
}

export function NoteEditor({ id, link }: { id?: string; link?: boolean }) {
  const notes = useNotes();
  const cols = useCollections();
  const existing = id ? notes.find((n) => n.id === id) : undefined;
  const [f, setFs] = useState<Partial<Note>>(existing || { tags: [], favorite: false });
  const [tagText, setTagText] = useState((existing?.tags || []).join(', '));
  const [showLink, setShowLink] = useState(!!link || !!existing?.url);
  useEffect(() => {
    if (existing) {
      setFs(existing);
      setTagText(existing.tags.join(', '));
    }
  }, [existing?.id]);
  const setF = (x: Partial<Note>) => setFs((o) => ({ ...o, ...x }));

  const save = async () => {
    const url = f.url ? normalizeUrl(f.url) || f.url : undefined;
    const title = f.title?.trim() || (url ? guessTitle(url) : (f.text || '').split('\n')[0].slice(0, 60));
    if (!title) return;
    const tags = tagText
      .split(/[,#]/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const rec = { title, text: f.text || undefined, url, image: f.image, collectionId: f.collectionId, tags: [...new Set(tags)], favorite: !!f.favorite };
    if (existing) await update<Note>('notes', existing.id, rec);
    else await create<Note>('notes', rec as any);
    closeEditor();
    toast('Enregistré');
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      const u = normalizeUrl(t);
      if (u) setF({ url: u, title: f.title || guessTitle(u) });
      else toast('Aucun lien dans le presse-papiers');
    } catch {
      toast('Colle le lien dans le champ (appui long → Coller)');
    }
  };

  return (
    <Sheet
      open
      onClose={closeEditor}
      title={existing ? 'Note' : showLink ? 'Nouveau lien' : 'Nouvelle note'}
      footer={
        <div className="flex gap-2">
          {existing && (
            <ConfirmButton
              onConfirm={async () => {
                await update('notes', existing.id, { deleted: true });
                closeEditor();
              }}
            >
              <Trash2 size={16} />
            </ConfirmButton>
          )}
          <button className="btn-ghost" onClick={() => setF({ favorite: !f.favorite })} aria-label="Favori">
            <Heart size={18} className={f.favorite ? 'fill-rasp text-rasp' : ''} />
          </button>
          <button className="btn-primary ml-auto px-6" onClick={save} data-testid="save-note">
            Enregistrer
          </button>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save())}>
        {showLink && (
          <Field label="Lien">
            <div className="flex gap-2">
              <input
                className="input"
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={f.url || ''}
                autoFocus={!existing}
                onChange={(e) => setF({ url: e.target.value })}
                onBlur={() => f.url && !f.title && normalizeUrl(f.url) && setF({ title: guessTitle(normalizeUrl(f.url)!) })}
                data-testid="note-url"
              />
              <button type="button" className="btn-soft shrink-0" onClick={paste}>
                <ClipboardPaste size={16} /> Coller
              </button>
            </div>
          </Field>
        )}
        <input className="input text-lg" placeholder="Titre" value={f.title || ''} onChange={(e) => setF({ title: e.target.value })} autoFocus={!existing && !showLink} data-testid="note-title" aria-label="Titre" />
        <GrowText rows={6} placeholder="Écris librement… (ingrédients, adresse, idées)" value={f.text || ''} onChange={(e) => setF({ text: e.target.value })} aria-label="Texte" />
        <Field label="Collection" group>
          <div className="flex flex-wrap gap-2">
            {cols.map((c) => (
              <button type="button" key={c.id} className={`chip ${f.collectionId === c.id ? 'chip-on' : ''}`} onClick={() => setF({ collectionId: f.collectionId === c.id ? undefined : c.id })}>
                <Icon name={c.icon} size={14} /> {c.name}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Mots-clés" hint="Séparés par des virgules">
          <input className="input" placeholder="ex : paris, brunch, été" value={tagText} onChange={(e) => setTagText(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          {!showLink && (
            <button type="button" className="btn-soft" onClick={() => setShowLink(true)}>
              + Lien
            </button>
          )}
          <label className="btn-soft cursor-pointer">
            <ImagePlus size={16} /> {f.image ? "Changer l'image" : 'Image'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setF({ image: await compressImage(file) });
              }}
            />
          </label>
          {f.image && (
            <div className="relative">
              <img src={f.image} alt="" className="h-16 w-16 rounded-xl object-cover" />
              <button type="button" className="absolute -right-2 -top-2 rounded-full bg-ink p-1 text-white" onClick={() => setF({ image: undefined })} aria-label="Retirer l'image">
                <X size={12} />
              </button>
            </div>
          )}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}
