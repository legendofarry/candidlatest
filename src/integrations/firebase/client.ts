import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"] ?? "AIzaSyBHbdPGXQddWpgbwAm6_w1kxlg22XCCyf8",
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"] ?? "candid-431db.firebaseapp.com",
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"] ?? "candid-431db",
  storageBucket:
    import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"] ?? "candid-431db.firebasestorage.app",
  messagingSenderId: import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"] ?? "684808500794",
  appId: import.meta.env["VITE_FIREBASE_APP_ID"] ?? "1:684808500794:web:0f6bd196f828164fd3a703",
};

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
