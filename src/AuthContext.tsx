import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { UserProfile } from "./types";

interface AuthState {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  // "ok" once we have a confirmed signed-in user with an active profile.
  // "signed-out" when there's no user at all.
  // "no-profile" when signed in but no matching users/{uid} doc, or profile.active === false.
  status: "loading" | "signed-out" | "no-profile" | "ok";
  signOutUser: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChanged fires exactly once with the resolved state, then again
    // on real changes. We do a ONE-TIME getDoc for the profile per user change —
    // no onSnapshot here, so a transient Firestore hiccup can't cause a render loop.
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          setProfile({ uid: u.uid, ...(snap.data() as Omit<UserProfile, "uid">) });
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error("Failed to load user profile", err);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const status: AuthState["status"] = loading
    ? "loading"
    : !firebaseUser
      ? "signed-out"
      : !profile || profile.active === false
        ? "no-profile"
        : "ok";

  return (
    <AuthCtx.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        status,
        signOutUser: () => signOut(auth),
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
