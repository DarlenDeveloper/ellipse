import {
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export type Tier = "starter" | "business" | "enterprise";
export type Role = "admin" | "employee";
export type Company = { name: string; industry: string; size: string; timezone: string };

// Best-effort default from the browser; falls back to UTC.
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
export type Invite = { email: string; role: Role; canApprove: boolean };

export type OnboardingState = {
  enterpriseId: string | null;
  step: number;
  complete: boolean;
  company: Company;
  tier: Tier;
  connections: string[];
};

// Where should a freshly authenticated user land?
// No enterprise or incomplete onboarding → /onboarding, else → /dashboard
export async function getLandingRoute(uid: string): Promise<string> {
  const userSnap = await getDoc(doc(db, "users", uid));
  const enterpriseId = userSnap.data()?.enterprise_id as string | undefined;
  if (!enterpriseId) return "/onboarding";

  const entSnap = await getDoc(doc(db, "enterprises", enterpriseId));
  if (!entSnap.exists() || !entSnap.data()?.onboarding_complete) return "/onboarding";

  return "/dashboard";
}

// Trial length (days) before the subscription window ends and the workspace freezes
const TRIAL_DAYS = 14;

// ---- Load current progress for a user ----
export async function loadOnboardingState(uid: string): Promise<OnboardingState> {
  const fallback: OnboardingState = {
    enterpriseId: null,
    step: 0,
    complete: false,
    company: { name: "", industry: "SaaS / Technology", size: "1-10", timezone: detectTimezone() },
    tier: "business",
    connections: [],
  };

  const userSnap = await getDoc(doc(db, "users", uid));
  const enterpriseId = userSnap.data()?.enterprise_id as string | undefined;
  if (!enterpriseId) return fallback;

  const entSnap = await getDoc(doc(db, "enterprises", enterpriseId));
  if (!entSnap.exists()) return fallback;
  const ent = entSnap.data();

  // Load selected connections
  const connSnap = await getDocs(
    query(collection(db, "connections"), where("enterprise_id", "==", enterpriseId))
  );
  const connections = connSnap.docs.map((d) => d.data().type as string);

  return {
    enterpriseId,
    step: ent.onboarding_step ?? 0,
    complete: ent.onboarding_complete ?? false,
    company: {
      name: ent.name ?? "",
      industry: ent.industry ?? "SaaS / Technology",
      size: ent.size ?? "1-10",
      timezone: ent.timezone ?? detectTimezone(),
    },
    tier: (ent.subscription_tier as Tier) ?? "business",
    connections,
  };
}

// ---- Step 1: Company → create/update enterprise, make user the owner ----
export async function saveCompany(
  uid: string,
  company: Company,
  existingEnterpriseId: string | null
): Promise<string> {
  if (existingEnterpriseId) {
    await updateDoc(doc(db, "enterprises", existingEnterpriseId), {
      name: company.name,
      industry: company.industry,
      size: company.size,
      timezone: company.timezone || detectTimezone(),
      onboarding_step: 1,
      updated_at: serverTimestamp(),
    });
    return existingEnterpriseId;
  }

  const ref = doc(collection(db, "enterprises"));
  await setDoc(ref, {
    name: company.name,
    industry: company.industry,
    size: company.size,
    timezone: company.timezone || detectTimezone(),
    subscription_tier: null,
    wallet_id: null,
    owner_id: uid,
    status: "onboarding",
    onboarding_step: 1,
    onboarding_complete: false,
    created_at: serverTimestamp(),
  });

  // Link the creator as the owner
  await updateDoc(doc(db, "users", uid), {
    enterprise_id: ref.id,
    role: "owner",
    can_approve: true,
  });

  return ref.id;
}

// ---- Step 2: Plan → set tier, ensure a wallet exists ----
export async function savePlan(enterpriseId: string, tier: Tier): Promise<void> {
  const entRef = doc(db, "enterprises", enterpriseId);
  const entSnap = await getDoc(entRef);
  let walletId = entSnap.data()?.wallet_id as string | null | undefined;

  const subscriptionEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  if (!walletId) {
    // Wallet tracks the subscription window only — no credits.
    const walletRef = doc(collection(db, "wallets"));
    await setDoc(walletRef, {
      enterprise_id: enterpriseId,
      subscription_start: serverTimestamp(),
      subscription_end: subscriptionEnd,
      status: "active",
      updated_at: serverTimestamp(),
    });
    walletId = walletRef.id;
  }

  await updateDoc(entRef, {
    subscription_tier: tier,
    wallet_id: walletId,
    onboarding_step: 2,
    updated_at: serverTimestamp(),
  });
}

// ---- Step 3: Connections → upsert selected, remove deselected ----
export async function saveConnections(
  enterpriseId: string,
  selected: string[]
): Promise<void> {
  const existingSnap = await getDocs(
    query(collection(db, "connections"), where("enterprise_id", "==", enterpriseId))
  );
  const existingTypes = existingSnap.docs.map((d) => d.data().type as string);

  // Remove deselected
  await Promise.all(
    existingSnap.docs
      .filter((d) => !selected.includes(d.data().type))
      .map((d) => deleteDoc(d.ref))
  );

  // Add newly selected
  await Promise.all(
    selected
      .filter((type) => !existingTypes.includes(type))
      .map((type) =>
        setDoc(doc(db, "connections", `${enterpriseId}_${type}`), {
          enterprise_id: enterpriseId,
          type,
          auth_type: "oauth2",
          status: "pending",
          enabled_actions: [],
          created_at: serverTimestamp(),
        })
      )
  );

  await updateDoc(doc(db, "enterprises", enterpriseId), {
    onboarding_step: 3,
    updated_at: serverTimestamp(),
  });
}

// ---- Step 4: Team → create pending invites, mark onboarding complete ----
export async function saveTeam(
  enterpriseId: string,
  invites: Invite[]
): Promise<void> {
  const valid = invites.filter((i) => i.email.trim());
  await Promise.all(
    valid.map((inv) =>
      setDoc(doc(db, "invites", `${enterpriseId}_${inv.email.trim().toLowerCase()}`), {
        enterprise_id: enterpriseId,
        email: inv.email.trim().toLowerCase(),
        role: inv.role,
        can_approve: inv.canApprove,
        status: "pending",
        created_at: serverTimestamp(),
      })
    )
  );

  await updateDoc(doc(db, "enterprises", enterpriseId), {
    status: "active",
    onboarding_step: 4,
    onboarding_complete: true,
    updated_at: serverTimestamp(),
  });
}
