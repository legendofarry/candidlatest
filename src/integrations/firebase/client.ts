import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

export const firebaseConfig = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"] ?? "AIzaSyAfuu1wA9oXJvNV5omY1Wg6RD-ncahsDgg",
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"] ?? "candid-bbef5.firebaseapp.com",
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"] ?? "candid-bbef5",
  storageBucket: import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"] ?? "candid-bbef5.firebasestorage.app",
  messagingSenderId: import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"] ?? "524579606484",
  appId: import.meta.env["VITE_FIREBASE_APP_ID"] ?? "1:524579606484:web:3c22f4436aab4d5ff0d041",
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
