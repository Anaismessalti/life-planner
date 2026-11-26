import { db, getMeta, setMeta } from '../db/db';
import { addDays, timeToMin, todayISO, weekday } from './dates';
import { eur, financeOccurrencesIn } from './finance';
import { expandTasks } from './tasks';

export interface NotifPrefs {
  enabled: boolean;
  events: boolean;
  eventsBefore: number;
  priority: boolean;
  deadlines: boolean;
  payments: boolean;
  daily: boolean;
  dailyTime: string;
  weekly: boolean;
}
export const DEFAULT_PREFS: NotifPrefs = {
  enabled: false,
  events: true,
  eventsBefore: 30,
  priority: true,
  deadlines: true,
  payments: true,
  daily: true,
  dailyTime: '08:00',
  weekly: true,
};

export const notifSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const getPrefs = async () => ({ ...DEFAULT_PREFS, ...(await getMeta<Partial<NotifPrefs>>('notifPrefs', {})) });
export const setPrefs = (p: NotifPrefs) => setMeta('notifPrefs', p);

export async function show(title: string, body: string, tag?: string) {
  if (!notifSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    else new Notification(title, { body, tag });
    return true;
  } catch {
    return false;
  }
}

/** Vérifie chaque minute (quand l'app est ouverte) les rappels à envoyer. Chaque rappel n'est envoyé qu'une fois. */
export async function checkReminders(nowDate = new Date()) {
  const prefs = await getPrefs();
  if (!prefs.enabled || !notifSupported() || Notification.permission !== 'granted') return;
  const today = todayISO();
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
  const sent = new Set(await getMeta<string[]>('notified', []));
  const send = async (key: string, title: string, body: string) => {
    if (sent.has(key)) return;
    sent.add(key);
    await show(title, body, key);
  };
  const all = await db.tasks.toArray();
  const day = expandTasks(all, today, addDays(today, 1));

  for (const t of day) {
    if (t.status === 'done' || !t.time || t.remindBefore === -1) continue;
    const isEvent = t.kind === 'event';
    if (isEvent && !prefs.events) continue;
    if (!isEvent && !(prefs.priority && t.priority === 'must') && t.remindBefore === undefined) continue;
    const before = t.remindBefore ?? (isEvent ? prefs.eventsBefore : 0);
    const at = timeToMin(t.time) - before + (t.date === today ? 0 : 1440);
    if (nowMin >= at && nowMin <= at + 20) {
      await send(`t:${t.id}:${t.date}`, isEvent ? `Rendez-vous à ${t.time}` : `C'est l'heure : ${t.title}`, isEvent ? `${t.title}${t.location ? ' · ' + t.location : ''}` : 'Tâche essentielle du jour');
    }
  }
  const morning = nowMin >= timeToMin(prefs.dailyTime);
  if (morning) {
    const tdy = day.filter((t) => t.date === today);
    if (prefs.daily) {
      const tasks = tdy.filter((t) => t.kind === 'task');
      const ev = tdy.filter((t) => t.kind === 'event');
      await send(`daily:${today}`, 'Ta journée ✨', `${tasks.length} tâche${tasks.length > 1 ? 's' : ''}, ${ev.length} rendez-vous${ev[0] ? ` (1er à ${ev[0].time || '—'})` : ''}`);
    }
    if (prefs.weekly && weekday(today) === 1) {
      const wk = expandTasks(all, today, addDays(today, 6));
      await send(`weekly:${today}`, 'Ta semaine', `${wk.filter((t) => t.kind === 'task').length} tâches et ${wk.filter((t) => t.kind === 'event').length} rendez-vous prévus`);
    }
    if (prefs.deadlines) {
      for (const t of all) {
        if (t.deleted || t.status === 'done' || !t.dueDate) continue;
        if (t.dueDate === today || t.dueDate === addDays(today, 1))
          await send(`due:${t.id}:${t.dueDate}`, t.dueDate === today ? "Échéance aujourd'hui" : 'Échéance demain', t.title);
      }
    }
    if (prefs.payments) {
      const fin = { incomes: await db.incomes.toArray(), fixed: await db.fixedExpenses.toArray(), payments: await db.payments.toArray() };
      for (const o of financeOccurrencesIn(fin, today, today)) {
        if (o.refType === 'fixed' && o.confirmed === undefined) await send(`pay:${o.refId}:${o.date}`, "Prélèvement aujourd'hui", `${o.label} · ${eur(o.planned)}`);
      }
    }
  }
  await setMeta('notified', [...sent].slice(-400));
}
