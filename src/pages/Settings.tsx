import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Bell, Cloud, Download, Moon, Palette, Plus, RefreshCw, ShieldCheck, Sun, Trash2, Upload, User } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ConfirmButton, Field, Section, Segmented, Toggle, toast } from '../components/ui';
import { create, db, getMeta, setMeta, setSetting, update } from '../db/db';
import type { BaseRecord, TableName } from '../db/types';
import { downloadBackup, exportFinanceCSV, exportTasksCSV, importBackup, deleteEverything, download } from '../lib/backup';
import { initSync } from '../lib/boot';
import { useSetting } from '../lib/hooks';
import { buildICS } from '../lib/ics';
import { COLORS, ICON_NAMES, Icon } from '../lib/icons';
import { DEFAULT_PREFS, getPrefs, notifSupported, setPrefs, show, type NotifPrefs } from '../lib/notify';
import { syncNow, syncStore, stopSync } from '../lib/sync/engine';
import { applyTheme, getTheme, type Theme } from '../lib/theme';

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          <span className="text-rasp">{icon}</span>
          {title}
        </span>
      }
    >
      <div className="card space-y-3 p-4">{children}</div>
    </Section>
  );
}

export function SettingsPage() {
  const name = useSetting<string>('userName', '');
  const [n, setN] = useState(name);
  useEffect(() => setN(name), [name]);
  const [theme, setTheme] = useState<Theme>(getTheme());

  return (
    <div className="space-y-7">
      <header className="anim-rise">
        <p className="label">Réglages</p>
        <h1 className="h-title text-4xl">Paramètres</h1>
      </header>

      <div className="grid gap-7 lg:grid-cols-2">
        <div className="min-w-0 space-y-7">
          <Card icon={<User size={18} />} title="Profil">
            <Field label="Ton prénom (pour la salutation)">
              <input className="input" value={n} onChange={(e) => setN(e.target.value)} onBlur={() => setSetting('userName', n.trim())} placeholder="Anaïs" />
            </Field>
          </Card>

          <Card icon={<Palette size={18} />} title="Apparence">
            <Segmented
              value={theme}
              onChange={(t) => {
                setTheme(t);
                applyTheme(t);
              }}
              options={[
                { value: 'light', label: <span className="inline-flex items-center gap-1"><Sun size={14} /> Clair</span> },
                { value: 'dark', label: <span className="inline-flex items-center gap-1"><Moon size={14} /> Sombre</span> },
                { value: 'auto', label: 'Auto' },
              ]}
            />
          </Card>

          <ListManager table="categories" title="Catégories de tâches" />
          <ListManager table="collections" title="Collections de notes" />
          <ListManager table="budgetCategories" title="Catégories de dépenses" withKind />
          <ListManager table="trackers" title="Suivis du journal" withGroup />
          <ListManager table="contacts" title="Mes proches" kindFilter="person" />
          <ListManager table="contacts" title="Mes lieux (bars, boîtes, restos)" kindFilter="place" />
        </div>

        <div className="min-w-0 space-y-7">
          <SyncCard />
          <NotificationsCard />
          <BackupCard />
          <Card icon={<ShieldCheck size={18} />} title="Confidentialité">
            <p className="text-sm text-soft">
              Tes données sont enregistrées sur cet appareil. Si tu actives la synchronisation, elles sont aussi stockées dans ton propre espace Firebase, accessible uniquement avec ton compte. Aucune
              publicité, aucun suivi.
            </p>
            <ConfirmButton
              confirmLabel="Vraiment tout effacer sur cet appareil ?"
              onConfirm={async () => {
                stopSync();
                await deleteEverything();
                location.reload();
              }}
            >
              <Trash2 size={16} /> Supprimer toutes mes données de cet appareil
            </ConfirmButton>
            <p className="text-xs text-soft">Pense à faire une sauvegarde avant. Les données déjà synchronisées restent sur ton compte Firebase.</p>
          </Card>
          <p className="text-center text-xs text-soft">Life Planner · version {__APP_VERSION__}</p>
        </div>
      </div>
    </div>
  );
}

type ListRec = BaseRecord & { name: string; color: string; icon: string; order: number; kind?: 'fixed' | 'variable'; group?: string };

function ListManager({ table, title, withKind, withGroup, kindFilter }: { table: TableName; title: string; withKind?: boolean; withGroup?: boolean; kindFilter?: 'person' | 'place' }) {
  const items = (useLiveQuery(() => db.table_(table).toArray(), [table], []) as ListRec[]).filter((x) => !x.deleted && (!kindFilter || (x as any).kind === kindFilter)).sort((a, b) => a.order - b.order);
  const [open, setOpen] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const move = async (i: number, d: number) => {
    const a = items[i];
    const b = items[i + d];
    if (!a || !b) return;
    await update(table, a.id, { order: b.order } as any);
    await update(table, b.id, { order: a.order } as any);
  };
  return (
    <Card icon={<Palette size={18} />} title={title}>
      <div className="space-y-1.5">
        {items.map((c, i) => (
          <div key={c.id} className="rounded-xl border border-line/70">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: c.color }} onClick={() => setOpen(open === c.id ? null : c.id)} aria-label="Couleur et icône">
                <Icon name={c.icon} size={15} />
              </button>
              <input className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && update(table, c.id, { name: e.target.value.trim() } as any)} aria-label="Nom" />
              {withKind && <span className="text-[11px] text-soft">{c.kind === 'fixed' ? 'fixe' : 'variable'}</span>}
              <button className="icon-btn h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter">
                <ArrowUp size={14} />
              </button>
              <button className="icon-btn h-8 w-8" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Descendre">
                <ArrowDown size={14} />
              </button>
              <ConfirmButton className="icon-btn h-8 w-8" confirmLabel="?" onConfirm={() => update(table, c.id, { deleted: true } as any)}>
                <Trash2 size={14} />
              </ConfirmButton>
            </div>
            {open === c.id && (
              <div className="space-y-2 border-t border-line/70 p-2">
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((col) => (
                    <button key={col} className={`h-7 w-7 rounded-full ${c.color === col ? 'ring-2 ring-ink ring-offset-2' : ''}`} style={{ background: col }} onClick={() => update(table, c.id, { color: col } as any)} aria-label={col} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {ICON_NAMES.map((ic) => (
                    <button key={ic} className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.icon === ic ? 'bg-rasp text-white' : 'text-plum hover:bg-blush'}`} onClick={() => update(table, c.id, { icon: ic } as any)} aria-label={ic}>
                      <Icon name={ic} size={15} />
                    </button>
                  ))}
                </div>
                {withGroup && (
                  <select className="input py-2 text-sm" value={c.group || 'autres'} onChange={(e) => update(table, c.id, { group: e.target.value } as any)} aria-label="Famille">
                    <option value="sorties">Sorties</option>
                    <option value="moi">Moi</option>
                    <option value="travail">Travail et voyages</option>
                    <option value="autres">Autres</option>
                  </select>
                )}
                {withKind && (
                  <Segmented
                    value={c.kind || 'variable'}
                    onChange={(k) => update(table, c.id, { kind: k } as any)}
                    options={[
                      { value: 'fixed', label: 'Dépense fixe' },
                      { value: 'variable', label: 'Dépense variable' },
                    ]}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          const order = Math.max(0, ...items.map((x) => x.order)) + 1;
          await create(table, { name: newName.trim(), color: COLORS[order % COLORS.length], icon: 'star', order, ...(withKind ? { kind: 'variable' } : {}), ...(withGroup ? { group: 'autres' } : {}), ...(kindFilter ? { kind: kindFilter, icon: kindFilter === 'place' ? 'martini' : 'users' } : {}) } as any);
          setNewName('');
        }}
      >
        <input className="input py-2" placeholder={kindFilter === 'person' ? 'Ajouter une personne' : kindFilter === 'place' ? 'Ajouter un lieu' : 'Nouvelle…'} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="icon-btn" aria-label="Ajouter">
          <Plus size={18} />
        </button>
      </form>
    </Card>
  );
}

function NotificationsCard() {
  const [p, setP] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [perm, setPerm] = useState(notifSupported() ? Notification.permission : 'unsupported');
  useEffect(() => {
    getPrefs().then(setP);
  }, []);
  const save = (x: Partial<NotifPrefs>) => {
    const n = { ...p, ...x };
    setP(n);
    setPrefs(n);
  };
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
  const enable = async () => {
    if (!notifSupported()) return;
    const r = await Notification.requestPermission();
    setPerm(r);
    if (r === 'granted') {
      save({ enabled: true });
      show('Notifications activées ✨', 'Tu recevras tes rappels du Life Planner.');
    }
  };
  return (
    <Card icon={<Bell size={18} />} title="Notifications et rappels">
      {perm === 'unsupported' ? (
        <p className="text-sm text-soft">
          {standalone ? 'Ce navigateur ne gère pas les notifications.' : "Sur iPhone et iPad, les notifications ne sont possibles qu'une fois l'app ajoutée à l'écran d'accueil (iOS 16.4 ou plus)."}
        </p>
      ) : perm !== 'granted' ? (
        <button className="btn-primary" onClick={enable}>
          <Bell size={16} /> Activer les notifications
        </button>
      ) : (
        <>
          <Toggle checked={p.enabled} onChange={(v) => save({ enabled: v })} label="Notifications activées" />
          {p.enabled && (
            <div className="space-y-1 border-t border-line/70 pt-2">
              <Toggle checked={p.events} onChange={(v) => save({ events: v })} label="Rappels de rendez-vous" />
              {p.events && (
                <select className="input py-2 text-sm" value={p.eventsBefore} onChange={(e) => save({ eventsBefore: Number(e.target.value) })}>
                  <option value={0}>À l'heure</option>
                  <option value={10}>10 min avant</option>
                  <option value={30}>30 min avant</option>
                  <option value={60}>1 h avant</option>
                  <option value={120}>2 h avant</option>
                </select>
              )}
              <Toggle checked={p.priority} onChange={(v) => save({ priority: v })} label="Tâches essentielles (à leur heure)" />
              <Toggle checked={p.deadlines} onChange={(v) => save({ deadlines: v })} label="Échéances (la veille et le jour même)" />
              <Toggle checked={p.payments} onChange={(v) => save({ payments: v })} label="Prélèvements du jour" />
              <Toggle checked={p.daily} onChange={(v) => save({ daily: v })} label="Récapitulatif quotidien" />
              <Toggle checked={p.weekly} onChange={(v) => save({ weekly: v })} label="Récapitulatif hebdomadaire (lundi)" />
              <Field label="Heure des récapitulatifs">
                <input type="time" className="input py-2" value={p.dailyTime} onChange={(e) => save({ dailyTime: e.target.value || '08:00' })} />
              </Field>
              <button className="btn-soft mt-2" onClick={() => show('Test ✨', 'Les notifications fonctionnent.')}>
                Tester une notification
              </button>
            </div>
          )}
        </>
      )}
      <div className="rounded-xl bg-blush/50 p-3 text-xs leading-relaxed text-ink/80">
        <strong>Bon à savoir sur iPhone :</strong> une application web ne peut pas réveiller ton téléphone toute seule sans serveur payant. Les rappels sont donc envoyés quand le Life Planner est
        ouvert ou vient d'être utilisé, et le récapitulatif s'affiche à la prochaine ouverture. Pour des alarmes fiables même app fermée et hors ligne, exporte tes rendez-vous vers le Calendrier
        d'Apple ci-dessous : ce sont alors les rappels natifs d'iOS qui sonnent.
      </div>
      <button
        className="btn-soft"
        onClick={async () => {
          download('life-planner-calendrier.ics', await buildICS(p.eventsBefore), 'text/calendar');
          toast('Ouvre le fichier puis « Ajouter au calendrier »');
        }}
      >
        <Download size={16} /> Exporter vers le Calendrier Apple (.ics)
      </button>
    </Card>
  );
}

function BackupCard() {
  const last = useLiveQuery(() => getMeta<number | null>('lastBackup', null), []);
  const [busy, setBusy] = useState(false);
  return (
    <Card icon={<Download size={18} />} title="Sauvegardes et export">
      <p className="text-sm text-soft">
        Dernière sauvegarde : {last ? new Date(last).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'jamais'}. Enregistre le fichier dans iCloud Drive (« Enregistrer
        dans Fichiers »).
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => downloadBackup().then(() => toast('Sauvegarde téléchargée'))}>
          <Download size={16} /> Sauvegarde complète
        </button>
        <label className={`btn-soft cursor-pointer ${busy ? 'opacity-50' : ''}`}>
          <Upload size={16} /> Restaurer
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setBusy(true);
              try {
                const n = await importBackup(await file.text());
                toast(`${n} éléments restaurés`);
                syncNow();
              } catch (err: any) {
                toast(err.message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost text-xs" onClick={exportTasksCSV}>
          Export CSV des tâches
        </button>
        <button className="btn-ghost text-xs" onClick={exportFinanceCSV}>
          Export CSV des finances
        </button>
      </div>
      <p className="text-xs text-soft">Attention : restaurer remplace les données actuelles par celles de la sauvegarde.</p>
    </Card>
  );
}

function SyncCard() {
  const st = useSyncExternalStore(syncStore.subscribe, syncStore.get);
  const cfg = useLiveQuery(() => getMeta<Record<string, string> | null>('firebaseConfig', null), []);
  const [cfgText, setCfgText] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [user, setUser] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    let off = () => {};
    import('../lib/sync/firebase').then(async (fb) => {
      if (!fb.isReady()) await initSync();
      off = fb.watchUser((u) => setUser(u?.email || null));
    });
    return () => off();
  }, [cfg?.projectId]);

  const saveCfg = async () => {
    const fb = await import('../lib/sync/firebase');
    const c = fb.parseConfig(cfgText);
    if (!c) return setErr('Je ne reconnais pas cette configuration. Copie tout le bloc « firebaseConfig » depuis Firebase.');
    setErr('');
    await setMeta('firebaseConfig', c);
  };
  const auth = async (createAccount: boolean) => {
    setBusy(true);
    setErr('');
    try {
      const fb = await import('../lib/sync/firebase');
      await fb.login(email.trim(), pwd, createAccount);
      toast(createAccount ? 'Compte créé, synchronisation lancée' : 'Connectée, synchronisation lancée');
    } catch (e) {
      const fb = await import('../lib/sync/firebase');
      setErr(fb.frError(e));
    } finally {
      setBusy(false);
    }
  };
  const statusText: Record<string, string> = {
    off: 'Désactivée',
    idle: 'À jour',
    syncing: 'Synchronisation…',
    error: 'Erreur',
    offline: 'Hors ligne : les changements seront envoyés au retour de la connexion',
  };

  return (
    <Card icon={<Cloud size={18} />} title="Synchronisation entre appareils">
      {!cfg ? (
        <>
          <p className="text-sm text-soft">
            Facultatif. Sans synchronisation, tout fonctionne sur cet appareil (pense aux sauvegardes). Pour retrouver tes données sur iPhone, iPad et Mac, crée un projet Firebase gratuit (guide
            pas à pas fourni) puis colle sa configuration ici.
          </p>
          <textarea className="input min-h-[110px] font-mono text-xs" placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  …\n};'} value={cfgText} onChange={(e) => setCfgText(e.target.value)} />
          <button className="btn-primary" onClick={saveCfg}>
            Enregistrer la configuration
          </button>
        </>
      ) : !user ? (
        <>
          <p className="text-sm text-soft">Projet Firebase : {cfg.projectId}. Connecte-toi avec le même e-mail et mot de passe sur chaque appareil.</p>
          <input className="input" type="email" autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" autoComplete="current-password" placeholder="Mot de passe (6 caractères min.)" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => auth(false)}>
              Se connecter
            </button>
            <button className="btn-soft" disabled={busy} onClick={() => auth(true)}>
              Créer mon compte (1re fois)
            </button>
          </div>
          <button
            className="btn-ghost text-xs"
            onClick={async () => {
              if (!email) return setErr("Saisis d'abord ton e-mail.");
              const fb = await import('../lib/sync/firebase');
              fb.resetPassword(email.trim()).then(() => toast('E-mail de réinitialisation envoyé'), (e) => setErr(fb.frError(e)));
            }}
          >
            Mot de passe oublié
          </button>
          <button className="btn-ghost text-xs" onClick={() => setMeta('firebaseConfig', null)}>
            Changer de configuration
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${st.status === 'idle' ? 'bg-emerald-500' : st.status === 'error' ? 'bg-red-500' : 'bg-amber-400'}`} />
            <span className="flex-1">
              {statusText[st.status]}
              {st.lastSync && st.status === 'idle' ? ` · ${new Date(st.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          </div>
          {st.error && <p className="text-xs text-red-600">{st.error}</p>}
          <p className="text-xs text-soft">Connectée : {user}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-soft" onClick={syncNow}>
              <RefreshCw size={16} /> Synchroniser
            </button>
            <button
              className="btn-ghost text-xs"
              onClick={async () => {
                const fb = await import('../lib/sync/firebase');
                await fb.logout();
                stopSync();
              }}
            >
              Se déconnecter
            </button>
          </div>
        </>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </Card>
  );
}
