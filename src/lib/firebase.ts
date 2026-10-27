/// <reference types="vite/client" />
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

/**
 * NETFLOW Browser V2 — Firebase Configuration & Initialization
 *
 * IMPORTANT FOR USER:
 * Replace the placeholder values below with your actual project keys
 * from the Firebase Console (https://console.firebase.google.com).
 * Alternatively, define these in your environment variables (e.g., .env)
 * prefixed with VITE_FIREBASE_*.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID",
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID"
);

// Initialize Firebase safely without throwing on duplicate or placeholder init
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.warn("[Firebase] Initialization warning (keys may be placeholder):", error);
  // Fallback dummy initialization to prevent module import crashes
  app = {} as FirebaseApp;
  auth = {} as Auth;
  db = {} as Firestore;
}

export const googleProvider = new GoogleAuthProvider();
export { app, auth, db };
export default app;
