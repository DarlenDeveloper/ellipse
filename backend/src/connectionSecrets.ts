import { db, FieldValue } from "./admin";

/**
 * Connection secrets (OAuth refresh/access tokens, API keys, passwords) live in
 * a SEPARATE collection that NO client can read — only Cloud Functions (admin
 * SDK, which bypasses security rules) touch it. The public `connections/{id}`
 * doc keeps only non-secret metadata (status, type, account_email, scope…) so
 * the UI can still show connection state without exposing credentials.
 *
 * Reads fall back to the legacy in-connection fields so existing connections
 * keep working until the one-time migration strips them.
 */

// Fields that must never be exposed to clients.
export const SECRET_FIELDS = [
  "refresh_token",
  "access_token",
  "access_token_expires_at",
  "api_key",
  "password",
] as const;

function secretRef(enterpriseId: string, type: string, ownerUid?: string) {
  return db.doc(`connection_secrets/${enterpriseId}_${type}${ownerUid ? `_personal_${ownerUid}` : ""}`);
}

export async function saveConnectionSecret(
  enterpriseId: string,
  type: string,
  secret: Record<string, unknown>,
  ownerUid?: string
): Promise<void> {
  await secretRef(enterpriseId, type, ownerUid).set(
    { enterprise_id: enterpriseId, type, scope: ownerUid ? "personal" : "org", owner_uid: ownerUid ?? null, ...secret, updated_at: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/**
 * Load a connection's secret fields. Prefers the locked connection_secrets doc;
 * falls back to the legacy fields on the connections doc (pre-migration).
 */
export async function getConnectionSecret(
  enterpriseId: string,
  type: string,
  legacy?: Record<string, unknown>,
  ownerUid?: string
): Promise<Record<string, any>> {
  const snap = await secretRef(enterpriseId, type, ownerUid).get();
  const secret = (snap.data() as Record<string, any>) ?? {};
  if (!legacy) return secret;
  // Fill any missing secret from the legacy connection doc.
  const merged: Record<string, any> = { ...secret };
  for (const f of SECRET_FIELDS) {
    if (merged[f] === undefined && legacy[f] !== undefined) merged[f] = legacy[f];
  }
  return merged;
}

export async function deleteConnectionSecret(enterpriseId: string, type: string, ownerUid?: string): Promise<void> {
  await secretRef(enterpriseId, type, ownerUid).delete().catch(() => undefined);
}
