import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

export const firebaseConfig = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"],
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"],
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"],
  storageBucket: import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"],
  messagingSenderId: import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"],
  appId: import.meta.env["VITE_FIREBASE_APP_ID"],
  databaseURL: import.meta.env["VITE_FIREBASE_DATABASE_URL"] ?? "",
};

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseRealtimeDb: Database | null = firebaseConfig.databaseURL
  ? getDatabase(firebaseApp, firebaseConfig.databaseURL)
  : null;

export async function registerFirebaseServiceWorker() {
  const config = encodeURIComponent(JSON.stringify(firebaseConfig));
  return navigator.serviceWorker.register(`/sw.js?firebaseConfig=${config}`);
}
