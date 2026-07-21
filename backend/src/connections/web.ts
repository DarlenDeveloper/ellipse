import { db, FieldValue } from "../admin";

/**
 * Website analytics — a lightweight tracker.
 *
 * The enterprise generates a site key, pastes a <script> tag on their site, and
 * each page load sends a beacon to collectWebEvent. Events are stored in
 * analytics_events (source "web"), the same store the Analytics page reads.
 */

function randomKey(): string {
  return "ell_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

/** Create (or return existing) a website + its tracking site key for an enterprise. */
export async function registerWebsite(
  enterpriseId: string,
  domain?: string
): Promise<{ siteKey: string }> {
  // Reuse an existing site for this enterprise if one exists.
  const existing = await db
    .collection("web_sites")
    .where("enterprise_id", "==", enterpriseId)
    .limit(1)
    .get();
  if (!existing.empty) {
    return { siteKey: existing.docs[0].id };
  }

  const siteKey = randomKey();
  await db.doc(`web_sites/${siteKey}`).set({
    enterprise_id: enterpriseId,
    domain: domain ?? null,
    created_at: FieldValue.serverTimestamp(),
  });
  return { siteKey };
}

// In-memory geo cache (per instance) to limit external lookups.
const geoCache = new Map<string, { country?: string; city?: string }>();

/** Look up country/city for an IP via a free geo API (cached). */
export async function geoLookup(ip?: string): Promise<{ country?: string; city?: string }> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("192.168") || ip.startsWith("10.")) return {};
  if (geoCache.has(ip)) return geoCache.get(ip)!;
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city`);
    const d = (await res.json()) as any;
    const g = d?.status === "success" ? { country: d.country, city: d.city } : {};
    geoCache.set(ip, g);
    return g;
  } catch {
    return {};
  }
}

/** Record a web event against the enterprise that owns the site key. */
export async function recordWebEvent(
  siteKey: string,
  data: {
    type?: string;
    url?: string;
    ref?: string;
    vid?: string;
    sid?: string;
    nv?: number | string;
    country?: string;
    city?: string;
  }
): Promise<boolean> {
  if (!siteKey) return false;
  const siteSnap = await db.doc(`web_sites/${siteKey}`).get();
  if (!siteSnap.exists) return false;
  const enterpriseId = siteSnap.data()?.enterprise_id as string | undefined;
  if (!enterpriseId) return false;

  await db.collection("analytics_events").add({
    source: "web",
    workspace_id: enterpriseId,
    payload: {
      channel: "web",
      type: data.type ?? "pageview",
      url: (data.url ?? "").slice(0, 500),
      referrer: (data.ref ?? "").slice(0, 500),
      visitor_id: (data.vid ?? "").slice(0, 100),
      session_id: (data.sid ?? "").slice(0, 100),
      is_new: data.nv === 1 || data.nv === "1",
      country: data.country ?? null,
      city: data.city ?? null,
    },
    timestamp: FieldValue.serverTimestamp(),
  });
  return true;
}

/**
 * Verify the tag is live: fetch the given URL and confirm the site key (or the
 * webTag script) is present in the returned HTML. Proves both that the site is
 * deployed/reachable AND the code was added. On success, activates the website
 * connection so the Integrations card shows Connected.
 */
export async function verifyWebsiteInstall(
  enterpriseId: string,
  url: string
): Promise<{ ok: boolean; found: boolean; error?: string }> {
  const snap = await db
    .collection("web_sites")
    .where("enterprise_id", "==", enterpriseId)
    .limit(1)
    .get();
  if (snap.empty) {
    return { ok: false, found: false, error: "Generate the tracking code first." };
  }
  const siteKey = snap.docs[0].id;

  let normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = "https://" + normalized;

  let html = "";
  try {
    const res = await fetch(normalized, {
      redirect: "follow",
      headers: { "User-Agent": "EllipseBot/1.0 (+installation-check)" },
    });
    if (!res.ok) return { ok: false, found: false, error: `Site returned HTTP ${res.status}.` };
    html = (await res.text()).slice(0, 500000);
  } catch {
    return { ok: false, found: false, error: "Could not reach the site. Is it deployed and public?" };
  }

  const found = html.includes(siteKey) || html.includes("/webTag");
  if (found) {
    await db.doc(`connections/${enterpriseId}_website`).set(
      {
        enterprise_id: enterpriseId,
        type: "website",
        status: "active",
        domain: normalized,
        site_key: siteKey,
        verified_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await snap.docs[0].ref.set({ domain: normalized, verified: true }, { merge: true });
  }
  return { ok: true, found };
}

/** The tracker script served to customer websites. */
export function trackerScript(): string {
  return `(function(){
  var s = document.currentScript;
  var site = s && s.getAttribute('data-site');
  if(!site) return;
  var endpoint = 'https://us-central1-ellipse-desk.cloudfunctions.net/collectWebEvent';
  var vid, nv = 0;
  try { vid = localStorage.getItem('_ell_vid'); if(!vid){ vid = Math.random().toString(36).slice(2)+Date.now().toString(36); localStorage.setItem('_ell_vid', vid); nv = 1; } } catch(e){ vid = 'anon'; }
  var sid;
  try { sid = sessionStorage.getItem('_ell_sid'); if(!sid){ sid = Math.random().toString(36).slice(2)+Date.now().toString(36); sessionStorage.setItem('_ell_sid', sid);} } catch(e){ sid = 'sess'; }
  function send(type){
    var body = JSON.stringify({ site: site, type: type, url: location.href, ref: document.referrer, vid: vid, sid: sid, nv: nv });
    try { if(navigator.sendBeacon){ navigator.sendBeacon(endpoint, body); return; } } catch(e){}
    fetch(endpoint, { method:'POST', body: body, keepalive:true, headers:{'Content-Type':'text/plain'} }).catch(function(){});
  }
  send('pageview');
  // Track SPA navigations (pushState / popstate).
  var push = history.pushState;
  history.pushState = function(){ push.apply(this, arguments); send('pageview'); };
  window.addEventListener('popstate', function(){ send('pageview'); });
})();`;
}
