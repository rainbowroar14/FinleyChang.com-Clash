import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

export interface FirebaseEnv {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function envVar(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env?.[name]) {
    return process.env[name];
  }
  const meta = import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  };
  const fromVite = meta.env?.[name];
  if (fromVite) return fromVite;
  return undefined;
}

function readEnv(): FirebaseEnv | null {
  const apiKey = envVar("VITE_FIREBASE_API_KEY");
  const authDomain = envVar("VITE_FIREBASE_AUTH_DOMAIN");
  const projectId = envVar("VITE_FIREBASE_PROJECT_ID");
  const storageBucket = envVar("VITE_FIREBASE_STORAGE_BUCKET");
  const messagingSenderId = envVar("VITE_FIREBASE_MESSAGING_SENDER_ID");
  const appId = envVar("VITE_FIREBASE_APP_ID");
  if (!apiKey || !projectId) return null;
  return {
    apiKey,
    authDomain: authDomain ?? "",
    projectId,
    storageBucket: storageBucket ?? "",
    messagingSenderId: messagingSenderId ?? "",
    appId: appId ?? "",
  };
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function isFirebaseConfigured(): boolean {
  return readEnv() !== null;
}

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const cfg = readEnv();
  if (!cfg) {
    throw new Error(
      "Firebase is not configured. Copy .env.example to .env and fill in your Web app keys.",
    );
  }
  app = initializeApp(cfg);
  return app;
}

export function getFirestoreDb(): Firestore {
  if (db) return db;
  db = getFirestore(getFirebaseApp());
  return db;
}
