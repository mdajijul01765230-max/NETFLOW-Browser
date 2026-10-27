import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "../lib/firebase";

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<User | null>;
  signUp: (email: string, password: string, displayName?: string) => Promise<User | null>;
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth?.onAuthStateChanged) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<User | null> => {
    if (!isFirebaseConfigured || !auth?.app) {
      throw new Error(
        "লগইন সিস্টেম চালু করতে ফায়ারবেস API কী প্রয়োজন (Firebase API Key is required to enable login). Please add your API keys to src/lib/firebase.ts."
      );
    }
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  };

  const signUp = async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<User | null> => {
    if (!isFirebaseConfigured || !auth?.app) {
      throw new Error(
        "লগইন সিস্টেম চালু করতে ফায়ারবেস API কী প্রয়োজন (Firebase API Key is required to enable login). Please add your API keys to src/lib/firebase.ts."
      );
    }
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && userCredential.user) {
      await updateProfile(userCredential.user, { displayName });
    }
    return userCredential.user;
  };

  const signInWithGoogle = async (): Promise<User | null> => {
    if (!isFirebaseConfigured || !auth?.app) {
      throw new Error(
        "লগইন সিস্টেম চালু করতে ফায়ারবেস API কী প্রয়োজন (Firebase API Key is required to enable login). Please add your API keys to src/lib/firebase.ts."
      );
    }
    const userCredential = await signInWithPopup(auth, googleProvider);
    return userCredential.user;
  };

  const signOut = async (): Promise<void> => {
    if (!isFirebaseConfigured || !auth?.app) {
      setCurrentUser(null);
      return;
    }
    await firebaseSignOut(auth);
  };

  const value: AuthContextType = {
    currentUser,
    loading,
    isConfigured: isFirebaseConfigured,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
