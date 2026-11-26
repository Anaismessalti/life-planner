// Adaptateur Firebase (Firestore + Authentification), chargé uniquement si la synchronisation est activée.
import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { RemoteAdapter, RemoteRecord } from './engine';
import type { TableName } from '../../db/types';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  [k: string]: string;
}

let app: FirebaseApp | null = null;

/** Accepte le bloc copié depuis la console Firebase (`const firebaseConfig = {...}`) ou du JSON. */
export function parseConfig(text: string): FirebaseConfig | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const obj: Record<string, string> = {};
  const re = /["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(m[0]))) obj[r[1]] = r[2];
  if (!obj.apiKey || !obj.projectId || !obj.appId) return null;
  if (!obj.authDomain) obj.authDomain = `${obj.projectId}.firebaseapp.com`;
  return obj as FirebaseConfig;
}

export const isReady = () => !!app;

export async function initFirebase(cfg: FirebaseConfig) {
  for (const a of getApps()) await deleteApp(a);
  app = initializeApp(cfg);
  return app;
}

export function watchUser(cb: (u: User | null) => void) {
  if (!app) return () => {};
  return onAuthStateChanged(getAuth(app), cb);
}

const FR_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
  'auth/wrong-password': 'Mot de passe incorrect.',
  'auth/user-not-found': 'Aucun compte avec cet e-mail.',
  'auth/email-already-in-use': 'Un compte existe déjà avec cet e-mail : utilise « Se connecter ».',
  'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/network-request-failed': 'Pas de connexion internet.',
  'auth/operation-not-allowed': "La connexion par e-mail n'est pas activée dans Firebase (étape 3 du guide).",
  'auth/too-many-requests': 'Trop de tentatives, réessaie dans quelques minutes.',
  'permission-denied': "Accès refusé par Firebase : vérifie les règles de sécurité (étape 4 du guide).",
};
export function frError(e: any): string {
  const code = e?.code || '';
  return FR_ERRORS[code] || e?.message || String(e);
}

export async function login(email: string, password: string, createAccount: boolean) {
  if (!app) throw new Error('Firebase non configuré');
  const auth = getAuth(app);
  const cred = createAccount
    ? await createUserWithEmailAndPassword(auth, email, password)
    : await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}
export async function resetPassword(email: string) {
  if (!app) throw new Error('Firebase non configuré');
  await sendPasswordResetEmail(getAuth(app), email);
}
export async function logout() {
  if (app) await signOut(getAuth(app));
}

/** Firestore refuse `undefined` : on nettoie l'objet. */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

const OVERLAP_MS = 2 * 60 * 1000;

export function firestoreAdapter(user: User): RemoteAdapter {
  if (!app) throw new Error('Firebase non configuré');
  const fs = getFirestore(app);
  const col = collection(fs, 'users', user.uid, 'records');
  return {
    async push(records: RemoteRecord[]) {
      for (let i = 0; i < records.length; i += 400) {
        const batch = writeBatch(fs);
        for (const { table, record } of records.slice(i, i + 400)) {
          batch.set(doc(col, `${table}__${record.id}`), { table, record: clean(record), srv: serverTimestamp() });
        }
        await batch.commit();
      }
    },
    async pull(cursor: number) {
      const out: RemoteRecord[] = [];
      // Petit chevauchement volontaire : relire 2 minutes est sans risque (fusion idempotente)
      // et évite de manquer une écriture validée en retard par le serveur.
      let from = Timestamp.fromMillis(Math.max(0, cursor - OVERLAP_MS));
      let max = cursor;
      for (;;) {
        const snap = await getDocs(query(col, where('srv', '>', from), orderBy('srv'), limit(500)));
        for (const d of snap.docs) {
          const data = d.data() as { table: TableName; record: any; srv?: Timestamp };
          out.push({ table: data.table, record: data.record });
          if (data.srv) {
            from = data.srv;
            max = Math.max(max, data.srv.toMillis());
          }
        }
        if (snap.size < 500) break;
      }
      return { records: out, cursor: max };
    },
  };
}
