# Mercury Computers REST API

A key-authenticated REST API for reading and writing store data: **products, orders, quotations, and repairs**. Built on Firebase Cloud Functions with the Firestore Admin SDK.

- **Base URL:** `https://us-central1-mercurycomputers-tech.cloudfunctions.net/api`
- **Version prefix:** `/v1` (optional but recommended)
- **Format:** JSON request and response bodies
- **Transport:** HTTPS only

---

## Authentication

Every request must include a valid API key. Send it as a Bearer token (preferred):

```
Authorization: Bearer mck_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

or as a header:

```
x-api-key: mck_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are created by an admin in the dashboard under **API Keys** (`/u/api-keys`). The full key is shown **only once** at creation — copy and store it securely. Only a SHA-256 hash is kept server-side, so a lost key cannot be recovered; create a new one instead.

### Auth failures

| Status | Meaning |
|--------|---------|
| `401 Unauthorized` | Missing, invalid, or revoked key |
| `403 Forbidden` | Key is valid but lacks the required scope |

---

## Scopes

Access is granted per resource, split into `read` and `write`. A key only does what its scopes allow.

| Scope | Grants |
|-------|--------|
| `products:read` | Read products |
| `products:write` | Create, update, delete products |
| `orders:read` / `orders:write` | Read / modify orders |
| `quotations:read` / `quotations:write` | Read / modify quotations |
| `repairs:read` / `repairs:write` | Read / modify repair tickets |

**Wildcards:**
- `products:*` — all actions on one resource
- `*` — full access to everything (use sparingly)

`GET` requests need the `:read` scope; `POST`, `PATCH`, `PUT`, and `DELETE` need `:write`.

---

## Resources

| Resource | Endpoint | Firestore collection |
|----------|----------|----------------------|
| Products | `/v1/products` | `products` |
| Orders | `/v1/orders` | `orders` |
| Quotations | `/v1/quotations` | `quotations` |
| Repairs | `/v1/repairs` | `repair_tickets` |

---

## Endpoints

### List
```
GET /v1/:resource
```
Query parameters:
- `q` — text search. Case-insensitive, matches tokens from `name`, `brand`, `category`, `subcategory`, `categoryId`. Multi-word queries match any token (e.g. `q=lenovo laptop`). Products only.
- `limit` — max items per page (default `50`, max `200`)
- `cursor` — opaque pagination cursor. Pass the previous response's `nextCursor` to get the next page; keep going until `nextCursor` is `null`.
- `status`, `brand`, `category`, `categoryId`, `subcategory` — exact-match filters. Can be combined with `q`.

```bash
# Search: "do you have Lenovo laptops?"
curl "https://us-central1-mercurycomputers-tech.cloudfunctions.net/api/v1/products?q=lenovo%20laptop&limit=100" \
  -H "Authorization: Bearer mck_live_xxx"

# Sweep the whole catalog with the cursor
curl "https://us-central1-mercurycomputers-tech.cloudfunctions.net/api/v1/products?limit=100&cursor=ChZhcHBsZS..." \
  -H "Authorization: Bearer mck_live_xxx"

# Exact filter
curl "https://us-central1-mercurycomputers-tech.cloudfunctions.net/api/v1/products?categoryId=laptops" \
  -H "Authorization: Bearer mck_live_xxx"
```

Response:
```json
{
  "data": [
    { "id": "lenovo-...", "name": "Lenovo ThinkPad ...", "brand": "lenovo", "priceUsd": 899 }
  ],
  "count": 1,
  "nextCursor": "ChZsZW5vdm8t...",
  "total": 121
}
```

Notes:
- `nextCursor` is `null` on the last page. Loop until it is `null` to read the entire catalog (300+ products span multiple pages).
- `total` is the exact count for the current filter/search and is returned only on the **first page** (when no `cursor` is sent). It is omitted when a query combines more filters than can be counted server-side.
- Search relies on a `searchTokens` array stored on each product. It is generated automatically whenever a product is created or updated (via the API or the admin dashboard).

### Get one
```
GET /v1/:resource/:id
```
```bash
curl https://us-central1-mercurycomputers-tech.cloudfunctions.net/api/v1/products/hp-250-g9 \
  -H "Authorization: Bearer mck_live_xxx"
```
Returns `{ "data": { ... } }`, or `404` if not found.

### Create
```
POST /v1/:resource
```
```bash
curl -X POST https://us-central1-mercurycomputers-tech.cloudfunctions.net/api/v1/products \
  -H "Authorization: Bearer mck_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HP 250 G9 Laptop",
    "category": "Laptops",
    "categoryId": "computers",
    "priceUsd": 450,
    "stock": 10,
    "status": "published"
  }'
```
Returns `201` with the created object (including its generated `id`). `createdAt` and `updatedAt` are set automatically.

### Update
```
PATCH /v1/:resource/:id
```
Partial update — only send the fields you want to change.
```bash
curl -X PATCH https://us-central1-mercurycomputers-tech.cloudfunctions.net/api/v1/products/hp-250-g9 \
  -H "Authorization: Bearer mck_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{ "stock": 3, "status": "out_of_stock" }'
```
Returns `200` with the updated object.

### Delete
```
DELETE /v1/:resource/:id
```
```bash
curl -X DELETE https://us-central1-mercurycomputers-tech.cloudfunctions.net/api/v1/quotations/q_123 \
  -H "Authorization: Bearer mck_live_xxx"
```
Returns `{ "data": { "id": "q_123", "deleted": true } }`.

---

## Reserved fields

These are managed by the server and ignored if sent in a request body:
`id`, `createdAt`, `updatedAt`.

---

## Response & error format

Success responses wrap the payload in `data` (lists also include `count`, `nextCursor`, and `total` on the first page). Errors return:
```json
{ "error": "Human-readable message." }
```

| Status | Meaning |
|--------|---------|
| `200` | OK |
| `201` | Created |
| `400` | Bad request (e.g. body is not a JSON object) |
| `401` | Missing / invalid / revoked key |
| `403` | Insufficient scope |
| `404` | Unknown endpoint or item not found |
| `405` | Method not allowed for that path |
| `500` | Internal error |

---

## Data shapes (reference)

Fields commonly present on each resource. The API does not enforce a strict schema on writes, so include the fields your integration needs.

**Product** (`products`)
```
name, description, shortDescription, category, categoryId, subcategory,
brand, priceUsd, oldPriceUsd, stock, isNew, image, images[],
specifications{}, status
```

**Order** (`orders`)
```
userId, userName, userEmail, items[], totalUsd, paymentMethod,
deliveryAddress, status
```

**Quotation** (`quotations`)
```
productId, productName, productPrice, userId, userName, userEmail,
userPhone, message, status, adminNote, quotedPrice
```

**Repair ticket** (`repairs` → `repair_tickets`)
```
userId, userName, userEmail, userPhone, device, issue, service,
status, technician, notes
```

Timestamps are returned as ISO 8601 strings.

---

## Managing keys (admins)

In the dashboard at **`/u/api-keys`**:
- **New Key** — set a label and tick the read/write scopes; the key is revealed once.
- **Revoke** — disables a key immediately (integrations stop working) but keeps its record.
- **Delete** — removes the key record permanently.

Keys are stored hashed and never displayed again after creation.

---

## Security notes

- Keys are stored as SHA-256 hashes; plaintext is shown only at creation.
- Grant the minimum scopes an integration needs; prefer separate read-only keys.
- Rotate keys periodically: create a new one, migrate, then revoke the old one.
- Never commit keys to source control or expose them in client-side/browser code.
- All access is logged (usage count + last-used timestamp per key).

---

## Logging & retention

Every request is logged (key, method, path, status, duration, IP) to power the
usage graphs and request logs on the **API Keys** dashboard page. Logs are
retained for **30 days** — a daily scheduled function (`cleanupApiLogs`)
automatically deletes older entries.

## Not yet implemented

- Per-key rate limiting
- Key expiry dates
- Separate `mck_test_` sandbox keys

Ask the maintainers if you need any of these.
