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
export type Company = { name: string; industry: string; size: string };
export type Invite = { email: string; role: Role; canApprove: boolean };

export type OnboardingState = {
  enterpriseId: string | null;
  step: number;
  complete: boolean;
  company: Company;
  tier: Tier;
  connections: string[];
};

const startingWalletBalance: Record<Tier, number> = {
  starter: 0,
  business: 500, // trial credit
  enterprise: 1000,
};

// ---- Load current progress for a user ----
export async function loadOnboardingState(uid: string): Promise<OnboardingState> {
  const fallback: OnboardingState = {
    enterpriseId: null,
    step: 0,
    complete: false,
    company: { name: "", industry: "SaaS / Technology", size: "1-10" },
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

  if (!walletId) {
    const walletRef = doc(collection(db, "wallets"));
    await setDoc(walletRef, {
      enterprise_id: enterpriseId,
      balance: startingWalletBalance[tier],
      currency: "USD",
      updated_at: serverTimestamp(),
    });
    walletId = walletRef.id;
  } else {
    // Update balance to reflect the chosen tier's trial credit
    await updateDoc(doc(db, "wallets", walletId), {
      balance: startingWalletBalance[tier],
      updated_at: serverTimestamp(),
    });
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
