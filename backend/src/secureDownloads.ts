import { HttpsError } from "firebase-functions/v2/https";
import { bucket, db } from "./admin";
import { grantedTypesFor } from "./access";

type Role = "owner" | "admin" | "employee";
type ResourceType = "document" | "report" | "knowledge_base";

const DOWNLOAD_TTL_MS = 5 * 60_000;
const CONNECTION_ALIASES: Record<string, string> = {
  gmail: "google-workspace",
  google: "google-workspace",
  "gmail-agent": "google-workspace",
  "zoho-agent": "zoho",
};

function connectionType(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CONNECTION_ALIASES[normalized] ?? normalized.replace(/-agent$/, "");
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function safeStoredName(value: unknown): string {
  const name = String(value ?? "").trim();
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    throw new HttpsError("failed-precondition", "This file does not have a safe stored filename.");
  }
  return name;
}

function expectedPrefix(type: ResourceType, enterpriseId: string, resourceId: string): string {
  const root = type === "document" ? "documents" : type === "report" ? "reports" : "knowledge_base";
  return `${root}/${enterpriseId}/${resourceId}/`;
}

function assertExactResourcePath(path: string, prefix: string) {
  const objectName = path.slice(prefix.length);
  if (!path.startsWith(prefix) || !objectName || objectName.includes("/") || objectName.includes("\\")) {
    throw new HttpsError("permission-denied", "The requested file does not belong to this record.");
  }
}

async function assertCanRead(
  uid: string,
  role: Role,
  resourceType: ResourceType,
  resource: Record<string, any>
) {
  const ownerUid = String(resource.owner_uid ?? "");
  const createdByUid = String(resource.created_by_uid ?? "");
  const scope = String(resource.connection_scope ?? "org");

  // Personal resources remain private even from organization managers.
  if (scope === "personal" || ownerUid) {
    if (ownerUid === uid) return;
    throw new HttpsError("permission-denied", "This is another member's personal file.");
  }
  if (resource.owner_only === true || resource.visibility === "owner") {
    if (role === "owner") return;
    throw new HttpsError("permission-denied", "Only the organization owner can download this file.");
  }
  if (createdByUid === uid) return;
  if (role === "owner" || role === "admin") return;

  // Knowledge-base files and legacy files without a trustworthy connection are
  // manager-only until their visibility metadata is explicitly backfilled.
  if (resourceType === "knowledge_base") {
    throw new HttpsError("permission-denied", "You do not have access to this knowledge-base file.");
  }

  const source = asRecord(resource.source);
  const type = connectionType(resource.connection_type ?? source.system ?? resource.agent);
  if (!type || type === "ellipse" || type === "agent" || type === "org-users" || type === "team") {
    throw new HttpsError("permission-denied", "This legacy file has no employee access scope.");
  }
  const grants = await grantedTypesFor(String(resource.enterprise_id), uid, role);
  if (grants === "all" || grants.has(type)) return;
  throw new HttpsError("permission-denied", "You do not have access to this file's integration.");
}

export async function createSecureDownload(
  uid: string,
  args: { resourceType?: string; resourceId?: string; fileIndex?: number }
) {
  const resourceType = args.resourceType as ResourceType | undefined;
  const resourceId = String(args.resourceId ?? "").trim();
  if (!resourceType || !["document", "report", "knowledge_base"].includes(resourceType) || !resourceId) {
    throw new HttpsError("invalid-argument", "A valid resourceType and resourceId are required.");
  }
  if (resourceId.includes("/")) throw new HttpsError("invalid-argument", "Invalid resource id.");

  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data();
  const enterpriseId = String(user?.enterprise_id ?? "");
  if (!enterpriseId) throw new HttpsError("failed-precondition", "You are not part of an organization.");
  const role = (user?.role as Role | undefined) ?? "employee";

  const collection = resourceType === "document" ? "documents" : resourceType === "report" ? "reports" : "knowledge_base";
  const resourceSnap = await db.doc(`${collection}/${resourceId}`).get();
  if (!resourceSnap.exists) throw new HttpsError("not-found", "File record not found.");
  const resource = resourceSnap.data() as Record<string, any>;
  if (resource.enterprise_id !== enterpriseId) {
    // Do not reveal whether a record in another organization exists.
    throw new HttpsError("not-found", "File record not found.");
  }
  await assertCanRead(uid, role, resourceType, resource);

  const fileIndex = Number.isInteger(args.fileIndex) ? Number(args.fileIndex) : 0;
  let storedFile: Record<string, any>;
  if (resourceType === "report") {
    const files = Array.isArray(resource.files) ? resource.files : [];
    if (fileIndex < 0 || fileIndex >= files.length) throw new HttpsError("not-found", "Report file not found.");
    storedFile = asRecord(files[fileIndex]);
  } else {
    if (fileIndex !== 0) throw new HttpsError("invalid-argument", "This resource has only one file.");
    storedFile = asRecord(resource.file);
  }

  const name = safeStoredName(storedFile.name);
  const prefix = expectedPrefix(resourceType, enterpriseId, resourceId);
  const recordedPath = storedFile.storage_path ?? resource.storage_path;
  // Legacy single-file records did not always persist storage_path. Their
  // uploaders used this deterministic location; no client path is accepted.
  const storagePath = String(recordedPath ?? `${prefix}${name.replace(/[^\w.\-]+/g, "_")}`);
  assertExactResourcePath(storagePath, prefix);

  const object = bucket().file(storagePath);
  const [exists] = await object.exists();
  if (!exists) throw new HttpsError("not-found", "Stored file not found.");

  const expiresAt = Date.now() + DOWNLOAD_TTL_MS;
  try {
    const [url] = await object.getSignedUrl({ action: "read", expires: expiresAt });
    return { url, name, expiresAt: new Date(expiresAt).toISOString() };
  } catch {
    throw new HttpsError("internal", "Could not prepare the secure download.");
  }
}
