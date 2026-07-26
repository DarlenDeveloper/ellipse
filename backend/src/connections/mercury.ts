import { db, FieldValue } from "../admin";

/**
 * Mercury Computers Store API connection (custom external integration).
 *
 * A key-authenticated REST API exposing the store's products, orders,
 * quotations and repairs. Unlike OAuth connections, this uses a static API key
 * (mck_live_...) the admin pastes in. We store it per enterprise and call the
 * API server-side with a Bearer token.
 *
 * Docs: External-integration-API.md
 */

const DEFAULT_BASE_URL = "https://us-central1-mercurycomputers-tech.cloudfunctions.net/api";

export const MERCURY_RESOURCES = ["products", "orders", "quotations", "repairs"] as const;
export type MercuryResource = (typeof MERCURY_RESOURCES)[number];

function connDoc(enterpriseId: string) {
  return db.doc(`connections/${enterpriseId}_mercury`);
}

type MercuryConfig = { api_key: string; base_url: string };

async function loadConfig(enterpriseId: string): Promise<MercuryConfig> {
  const snap = await connDoc(enterpriseId).get();
  const d = snap.data() as { api_key?: string; base_url?: string; status?: string } | undefined;
  const { getConnectionSecret } = await import("../connectionSecrets");
  const secret = await getConnectionSecret(enterpriseId, "mercury", d as Record<string, unknown>);
  if (!secret.api_key) throw new Error("Mercury Store not connected");
  return { api_key: secret.api_key, base_url: d?.base_url || DEFAULT_BASE_URL };
}

/** Low-level request to the Mercury Store API. */
async function mercuryRequest(
  cfg: MercuryConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<any> {
  const res = await fetch(`${cfg.base_url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.api_key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(json?.error || `Mercury API ${res.status}`);
  }
  return json;
}

function isResource(r: string): r is MercuryResource {
  return (MERCURY_RESOURCES as readonly string[]).includes(r);
}

// ---- Connect / test ----

/** Verify the API key by hitting a read endpoint, then persist the connection. */
export async function saveMercuryConnection(
  enterpriseId: string,
  apiKey: string,
  baseUrl?: string
): Promise<{ ok: true }> {
  const cfg: MercuryConfig = { api_key: apiKey, base_url: baseUrl || DEFAULT_BASE_URL };
  // Probe a lightweight read to validate the key/scope.
  await mercuryRequest(cfg, "GET", "/v1/products?limit=1");
  const { saveConnectionSecret } = await import("../connectionSecrets");
  await saveConnectionSecret(enterpriseId, "mercury", { api_key: apiKey });
  await connDoc(enterpriseId).set(
    {
      enterprise_id: enterpriseId,
      type: "mercury",
      auth_type: "api_key",
      status: "active",
      base_url: cfg.base_url,
      connected_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true };
}

// ---- Read ----

export type ListOpts = {
  limit?: number;
  status?: string;
  q?: string;
  brand?: string;
  category?: string;
  categoryId?: string;
  subcategory?: string;
  cursor?: string;
};

export type ListPage = { items: any[]; nextCursor: string | null; total?: number };

function buildListParams(opts: ListOpts): string {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(Math.min(opts.limit, 200)));
  if (opts.status) params.set("status", opts.status);
  if (opts.q) params.set("q", opts.q);
  if (opts.brand) params.set("brand", opts.brand);
  if (opts.category) params.set("category", opts.category);
  if (opts.categoryId) params.set("categoryId", opts.categoryId);
  if (opts.subcategory) params.set("subcategory", opts.subcategory);
  if (opts.cursor) params.set("cursor", opts.cursor);
  return params.toString();
}

/** One page of results (supports q search, filters and cursor pagination). */
export async function listResource(
  enterpriseId: string,
  resource: string,
  opts: ListOpts = {}
): Promise<ListPage> {
  if (!isResource(resource)) throw new Error(`Unknown resource: ${resource}`);
  const cfg = await loadConfig(enterpriseId);
  const qs = buildListParams(opts);
  const data = await mercuryRequest(cfg, "GET", `/v1/${resource}${qs ? `?${qs}` : ""}`);
  return {
    items: data?.data ?? [],
    nextCursor: data?.nextCursor ?? null,
    total: typeof data?.total === "number" ? data.total : undefined,
  };
}

/**
 * Sweep every page via the cursor so the agent sees the whole catalog (not just
 * the first 200). Capped to avoid runaway reads on huge collections.
 */
export async function listAllResource(
  enterpriseId: string,
  resource: string,
  opts: Omit<ListOpts, "cursor"> = {},
  maxItems = 1000
): Promise<{ items: any[]; total?: number }> {
  const pageSize = Math.min(opts.limit || 200, 200);
  let cursor: string | null | undefined;
  let total: number | undefined;
  const items: any[] = [];
  // Hard page ceiling as a safety net (maxItems governs normally).
  for (let page = 0; page < 50; page++) {
    const res = await listResource(enterpriseId, resource, { ...opts, limit: pageSize, cursor: cursor || undefined });
    if (total === undefined && res.total !== undefined) total = res.total;
    items.push(...res.items);
    cursor = res.nextCursor;
    if (!cursor || items.length >= maxItems) break;
  }
  return { items, total };
}

export async function getResource(enterpriseId: string, resource: string, id: string): Promise<any> {
  if (!isResource(resource)) throw new Error(`Unknown resource: ${resource}`);
  const cfg = await loadConfig(enterpriseId);
  const data = await mercuryRequest(cfg, "GET", `/v1/${resource}/${encodeURIComponent(id)}`);
  return data?.data ?? null;
}

// ---- Write (routed through the approval gate) ----

export async function createResource(
  enterpriseId: string,
  resource: string,
  fields: Record<string, unknown>
): Promise<string | null> {
  if (!isResource(resource)) throw new Error(`Unknown resource: ${resource}`);
  const cfg = await loadConfig(enterpriseId);
  const data = await mercuryRequest(cfg, "POST", `/v1/${resource}`, fields);
  return data?.data?.id ?? null;
}

export async function updateResource(
  enterpriseId: string,
  resource: string,
  id: string,
  fields: Record<string, unknown>
): Promise<string | null> {
  if (!isResource(resource)) throw new Error(`Unknown resource: ${resource}`);
  const cfg = await loadConfig(enterpriseId);
  const data = await mercuryRequest(cfg, "PATCH", `/v1/${resource}/${encodeURIComponent(id)}`, fields);
  return data?.data?.id ?? id;
}

export async function deleteResource(enterpriseId: string, resource: string, id: string): Promise<string | null> {
  if (!isResource(resource)) throw new Error(`Unknown resource: ${resource}`);
  const cfg = await loadConfig(enterpriseId);
  await mercuryRequest(cfg, "DELETE", `/v1/${resource}/${encodeURIComponent(id)}`);
  return id;
}

/** TEMPORARY debug — raw GET against the API with an arbitrary query string. Remove before ship. */
export async function mercuryRawGet(enterpriseId: string, path: string): Promise<any> {
  const cfg = await loadConfig(enterpriseId);
  return mercuryRequest(cfg, "GET", path);
}

/** Is the Mercury Store connected + active for this enterprise? */
export async function isMercuryConnected(enterpriseId: string): Promise<boolean> {
  const snap = await connDoc(enterpriseId).get();
  return snap.exists && snap.data()?.status === "active";
}
