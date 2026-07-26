"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth-context";

/**
 * Resolves the signed-in user's role + which connection types they may see.
 *
 * - Owner / Admin  → managers: see everything in the org.
 * - Employee       → only the shared connection types granted to them
 *                    (connection_grants/{enterpriseId}_{uid}.types) plus their
 *                    own personal connections.
 *
 * Data surfaces (inbox, dashboard, analytics, approvals, reports) use this to
 * scope what an employee can view. NOTE: this is UI scoping only — real
 * enforcement requires Firestore security rules (security pass).
 */

export type Role = "owner" | "admin" | "employee";

// Inbox message channels are themselves connection types.
export type AccessState = {
  loading: boolean;
  enterpriseId: string | null;
  role: Role;
  isManager: boolean;
  grantedTypes: Set<string>;
  allowsType: (type: string) => boolean;
  allowsChannel: (channel: string) => boolean;
};

export function useAccess(): AccessState {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("employee");
  const [grantedTypes, setGrantedTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let unsubGrant: (() => void) | undefined;
    let active = true;
    (async () => {
      const uSnap = await getDoc(doc(db, "users", user.uid));
      if (!active) return;
      const d = uSnap.data();
      const eid = (d?.enterprise_id as string) ?? null;
      const r = (d?.role as Role) ?? "employee";
      setEnterpriseId(eid);
      setRole(r);
      if (eid && r === "employee") {
        // Watch the grant so approvals reflect live.
        unsubGrant = onSnapshot(doc(db, "connection_grants", `${eid}_${user.uid}`), (g) => {
          setGrantedTypes(new Set(((g.data()?.types as string[] | undefined) ?? [])));
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (unsubGrant) unsubGrant();
    };
  }, [user]);

  const isManager = role === "owner" || role === "admin";
  const allowsType = (type: string) => isManager || grantedTypes.has(type);
  const allowsChannel = (channel: string) => isManager || grantedTypes.has(channel);

  return { loading, enterpriseId, role, isManager, grantedTypes, allowsType, allowsChannel };
}
