import { createHash, randomUUID } from "crypto";
import { db, bucket, FieldValue } from "./admin";
import {
  createRecord,
  downloadQuoteMailMerge,
  searchByEmail,
  searchRecordsByWord,
  getZohoConnectionOwner,
} from "./connections/zoho";

export type ZohoQuotationRequest = {
  workflowKey: string;
  agentId: string;
  customer: { name: string; email: string; company?: string; phone?: string };
  items: { product: string; quantity: number; rate?: number }[];
  subject?: string;
  templateName?: string;
  conversationId?: string;
};

const clean = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function splitName(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    First_Name: parts.length > 1 ? parts.slice(0, -1).join(" ") : undefined,
    Last_Name: parts.at(-1) || email.split("@")[0] || "Customer",
  };
}

async function resolveProduct(enterpriseId: string, query: string) {
  const rows = await searchRecordsByWord(enterpriseId, "Products", query);
  const terms = normalized(query).split(" ").filter((t) => t.length > 1);
  const ranked = rows
    .map((row) => {
      const text = normalized(`${row.Product_Name ?? ""} ${row.Product_Code ?? ""}`);
      const score = terms.filter((term) => text.includes(term)).length;
      return { row, score };
    })
    .filter(({ score }) => score === terms.length)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) throw new Error(`No exact Zoho Product match for “${query}”. Sync or create the product first.`);
  if (ranked.length > 1) {
    const exact = ranked.find(({ row }) => normalized(row.Product_Name) === normalized(query));
    if (exact) return exact.row;
    throw new Error(`Multiple Zoho Products match “${query}”. Use the exact product name or SKU.`);
  }
  return ranked[0].row;
}

/** Idempotent compound workflow: customer → Zoho Quote → Writer PDF → Ellipse Data. */
export async function createZohoQuotationWorkflow(
  enterpriseId: string,
  request: ZohoQuotationRequest
): Promise<{ quoteId: string; documentId: string; fileName: string; url: string }> {
  if (!request.workflowKey) throw new Error("Missing quotation workflow key");
  if (!request.customer?.email || !request.customer?.name) throw new Error("Customer name and email are required");
  if (!request.items?.length) throw new Error("At least one quotation item is required");

  const settings = (await db.doc(`quotation_settings/${enterpriseId}`).get()).data();
  const connectionOwnerUid = getZohoConnectionOwner();
  const templateName = clean(request.templateName || settings?.zoho_mail_merge_template);
  if (!templateName) throw new Error("Configure the Zoho Quote mail-merge template in Settings → Quotation first.");

  const stateRef = db.doc(`quotation_workflows/${request.workflowKey}`);
  const existing = (await stateRef.get()).data();
  if (existing?.status === "complete" && existing.document_id && existing.quote_id) {
    const document = (await db.doc(`documents/${existing.document_id}`).get()).data();
    return {
      quoteId: existing.quote_id,
      documentId: existing.document_id,
      fileName: document?.file?.name,
      url: document?.file?.url,
    };
  }
  await stateRef.set({ enterprise_id: enterpriseId, status: "running", request, updated_at: FieldValue.serverTimestamp() }, { merge: true });

  const email = clean(request.customer.email).toLowerCase();
  const names = splitName(clean(request.customer.name), email);
  let leadId = existing?.lead_id as string | undefined;
  if (!leadId) {
    leadId = (await searchByEmail(enterpriseId, "Leads", email))?.id;
    if (!leadId) {
      leadId = (await createRecord(enterpriseId, "Leads", {
        ...names,
        Email: email,
        Company: clean(request.customer.company) || clean(request.customer.name),
        Phone: clean(request.customer.phone) || undefined,
        Lead_Source: "Ellipse",
      })) || undefined;
    }
    if (!leadId) throw new Error("Zoho did not create the Lead");
    await stateRef.set({ lead_id: leadId }, { merge: true });
  }

  const company = clean(request.customer.company) || clean(request.customer.name);
  let accountId = existing?.account_id as string | undefined;
  if (!accountId) {
    const accounts = await searchRecordsByWord(enterpriseId, "Accounts", company);
    accountId = accounts.find((a) => normalized(a.Account_Name) === normalized(company))?.id;
    if (!accountId) accountId = (await createRecord(enterpriseId, "Accounts", { Account_Name: company })) || undefined;
    if (!accountId) throw new Error("Zoho did not create the Account required by the Quote");
    await stateRef.set({ account_id: accountId }, { merge: true });
  }

  let contactId = existing?.contact_id as string | undefined;
  if (!contactId) {
    contactId = (await searchByEmail(enterpriseId, "Contacts", email))?.id;
    if (!contactId) {
      contactId = (await createRecord(enterpriseId, "Contacts", {
        ...names,
        Email: email,
        Phone: clean(request.customer.phone) || undefined,
        Account_Name: { id: accountId },
      })) || undefined;
    }
    if (!contactId) throw new Error("Zoho did not create the Contact required by the Quote");
    await stateRef.set({ contact_id: contactId }, { merge: true });
  }

  let quoteId = existing?.quote_id as string | undefined;
  const resolvedItems: Record<string, unknown>[] = [];
  if (!quoteId) {
    for (const item of request.items) {
      const product = await resolveProduct(enterpriseId, clean(item.product));
      const rate = Number(item.rate) > 0 ? Number(item.rate) : Number(product.Unit_Price ?? 0);
      if (!(rate > 0)) throw new Error(`Zoho Product “${item.product}” has no usable price.`);
      resolvedItems.push({
        Product_Name: { id: product.id },
        Quantity: Math.max(1, Number(item.quantity) || 1),
        List_Price: rate,
      });
    }
    quoteId = (await createRecord(enterpriseId, "Quotes", {
      Subject: clean(request.subject) || `Quotation for ${company}`,
      Account_Name: { id: accountId },
      Contact_Name: { id: contactId },
      Quote_Stage: "Draft",
      Quoted_Items: resolvedItems,
    })) || undefined;
    if (!quoteId) throw new Error("Zoho did not create the Quote");
    await stateRef.set({ quote_id: quoteId }, { merge: true });
  }

  const safeName = `Zoho_Quotation_${quoteId}.pdf`;
  const pdf = await downloadQuoteMailMerge(enterpriseId, quoteId, templateName, safeName);
  const documentId = `zoho_quote_${createHash("sha256").update(`${enterpriseId}:${quoteId}:${templateName}`).digest("hex").slice(0, 32)}`;
  const path = `documents/${enterpriseId}/${documentId}/${safeName}`;
  const token = randomUUID();
  await bucket().file(path).save(pdf, {
    contentType: "application/pdf",
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    resumable: false,
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  await db.doc(`documents/${documentId}`).set({
    enterprise_id: enterpriseId,
    agent: request.agentId,
    agent_label: "Zoho CRM",
    logo: "/logos/zoho.png",
    title: clean(request.subject) || `Zoho Quotation for ${company}`,
    kind: "pdf",
    file: { name: safeName, url, type: "pdf", size: pdf.length },
    storage_path: path,
    content_type: "application/pdf",
    source: { system: "zoho", module: "Quotes", quote_id: quoteId, lead_id: leadId, account_id: accountId, contact_id: contactId, template_name: templateName, workflow_key: request.workflowKey },
    customer: { name: request.customer.name, email, company },
    connection_scope: connectionOwnerUid ? "personal" : "org",
    owner_uid: connectionOwnerUid ?? null,
    sha256: createHash("sha256").update(pdf).digest("hex"),
    created_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  await stateRef.set({ status: "complete", quote_id: quoteId, document_id: documentId, completed_at: FieldValue.serverTimestamp() }, { merge: true });
  return { quoteId, documentId, fileName: safeName, url };
}
