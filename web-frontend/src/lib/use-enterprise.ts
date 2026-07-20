"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth-context";

/**
 * Resolves the signed-in user's enterprise_id from their users/{uid} doc.
 * Shared across dashboard widgets so each doesn't re-implement the lookup.
 */
export function useEnterpriseId(): { enterpriseId: string | null; loading: boolean } {
  const { user } = useAuth();
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (!active) return;
      setEnterpriseId((snap.data()?.enterprise_id as string | undefined) ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user]);

  return { enterpriseId, loading };
}
