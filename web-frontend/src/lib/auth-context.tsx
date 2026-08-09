"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  signOut,
  type User,
  type UserCredential,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signUpWithEmail: (name: string, email: string, password: string, legalVersion: string) => Promise<UserCredential>;
  signInWithEmail: (email: string, password: string) => Promise<UserCredential>;
  signInWithGoogle: (legalVersion?: string) => Promise<UserCredential>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Create the users/{uid} doc if it doesn't already exist.
async function ensureUserDoc(user: User, displayName?: string, legalVersion?: string) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email,
      display_name: displayName ?? user.displayName ?? "",
      enterprise_id: null, // set during org creation
      role: null, // becomes "owner" when they create an org
      can_approve: false,
      status: "active",
      created_at: serverTimestamp(),
      ...(legalVersion ? {
        terms_accepted_at: serverTimestamp(),
        privacy_accepted_at: serverTimestamp(),
        legal_version: legalVersion,
      } : {}),
    });
  } else if (legalVersion) {
    await setDoc(ref, {
      terms_accepted_at: serverTimestamp(),
      privacy_accepted_at: serverTimestamp(),
      legal_version: legalVersion,
    }, { merge: true });
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signUpWithEmail = async (name: string, email: string, password: string, legalVersion: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await ensureUserDoc(cred.user, name, legalVersion);
    return cred;
  };

  const signInWithEmail = async (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async (legalVersion?: string) => {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserDoc(cred.user, undefined, legalVersion);
    return cred;
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signUpWithEmail, signInWithEmail, signInWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
