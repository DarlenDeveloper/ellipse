import { db, FieldValue } from "./admin";
import {
  createRecord,
  searchByEmail,
  searchRecordsByWord,
  getZohoConnectionOwner,
  listModuleFields,
  updateRecord,
} from "./connections/zoho";

export type ZohoQuotationRequest = {
  workflowKey: string;
  agentId: string;
  customer: {
    name: string;
    email: string;
    company?: string;
    phone?: string;
    billingCity?: string;
    tin?: string;
  };
  items: { product: string; quantity: number; rate?: number; description?: string }[];
  subject?: string;
  quoteDate?: string;
  dealName?: string;
  currency?: string;
  vatExempt?: boolean;
  preparedBy?: string;
  bankDetails?: string;
  conversationId?: string;
};

const clean = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, omitUndefined(child)])
    );
  }
  return value;
}

async function resolveAccountTinField(enterpriseId: string): Promise<string | undefined> {
  const fields = await listModuleFields(enterpriseId, "Accounts");
  const exact = fields.find((field) => /^(client\s+)?tin(\s*(no|number))?\.?$/i.test(field.label.trim()));
  const taxId = fields.find((field) => /tax\s*(identification|id)\s*(no|number)?/i.test(field.label));
  return (exact ?? taxId)?.api_name;
}

async function resolveDealStage(enterpriseId: string): Promise<string> {
  const fields = await listModuleFields(enterpriseId, "Deals");
  const values = fields.find((field) => field.api_name === "Stage")?.pick_list_values ?? [];
  return values.find((value) => normalized(value) === "qualification")
    ?? values.find((value) => !/closed|lost|won/i.test(value))
    ?? "Qualification";
}

function splitName(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    First_Name: parts.length > 1 ? parts.slice(0, -1).join(" ") : undefined,
    Last_Name: parts.at(-1) || email.split("@")[0] || "Customer",
  };
}

async function resolveProduct(enterpriseId: string, query: string) {
  const terms = normalized(query).split(" ").filter((t) => t.length > 1);
  let rows = await searchRecordsByWord(enterpriseId, "Products", query);
  if (!rows.length && terms.length > 3) {
    rows = await searchRecordsByWord(enterpriseId, "Products", terms.slice(0, 4).join(" "));
  }
  const ranked = rows
    .map((row) => {
      const text = normalized(`${row.Product_Name ?? ""} ${row.Product_Code ?? ""}`);
      const score = terms.filter((term) => text.includes(term)).length;
      return { row, score };
    })
    .filter(({ score }) => score >= Math.min(3, terms.length))
    .sort((a, b) => b.score - a.score || normalized(a.row.Product_Name).localeCompare(normalized(b.row.Product_Name)));
  if (!ranked.length) throw new Error(`No exact Zoho Product match for “${query}”. Sync or create the product first.`);
  const exact = ranked.find(({ row }) => normalized(row.Product_Name) === normalized(query));
  if (exact) return exact.row;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    throw new Error(`Multiple Zoho Products match “${query}”. Use the exact product name or SKU.`);
  }
  return ranked[0].row;
}

/** Idempotent hybrid workflow: CRM capture in Zoho → deterministic Ellipse PDF. */
export async function createZohoQuotationWorkflow(
  enterpriseId: string,
  request: ZohoQuotationRequest
): Promise<{ dealId: string; documentId: string; fileName: string; url: string }> {
  if (!request.workflowKey) throw new Error("Missing quotation workflow key");
  if (!request.customer?.email || !request.customer?.name) throw new Error("Customer name and email are required");
  if (!request.items?.length) throw new Error("At least one quotation item is required");

  const connectionOwnerUid = getZohoConnectionOwner();

  const stateRef = db.doc(`quotation_workflows/${request.workflowKey}`);
  const existing = (await stateRef.get()).data();
  if (existing?.status === "complete" && existing.document_id && existing.deal_id) {
    const document = (await db.doc(`documents/${existing.document_id}`).get()).data();
    return {
      dealId: existing.deal_id,
      documentId: existing.document_id,
      fileName: document?.file?.name,
      url: document?.file?.url,
    };
  }
  await stateRef.set({
    enterprise_id: enterpriseId,
    status: "running",
    request: omitUndefined(request),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });

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
  const billingCity = clean(request.customer.billingCity);
  const clientTin = clean(request.customer.tin);
  const tinField = clientTin ? await resolveAccountTinField(enterpriseId) : undefined;
  const accountFields: Record<string, unknown> = {
    Account_Name: company,
    Billing_City: billingCity || undefined,
    ...(tinField ? { [tinField]: clientTin } : {}),
  };
  let accountId = existing?.account_id as string | undefined;
  if (!accountId) {
    const accounts = await searchRecordsByWord(enterpriseId, "Accounts", company);
    accountId = accounts.find((a) => normalized(a.Account_Name) === normalized(company))?.id;
    if (!accountId) accountId = (await createRecord(enterpriseId, "Accounts", accountFields)) || undefined;
    if (!accountId) throw new Error("Zoho did not create the Account required by the Deal");
    await stateRef.set({ account_id: accountId }, { merge: true });
  }
  if (accountId && (billingCity || clientTin)) {
    await updateRecord(enterpriseId, "Accounts", accountId, accountFields);
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
    if (!contactId) throw new Error("Zoho did not create the Contact required by the Deal");
    await stateRef.set({ contact_id: contactId }, { merge: true });
  }

  const resolvedItems: Record<string, unknown>[] = [];
  for (const item of request.items) {
    let product: Record<string, any> | undefined;
    try {
      product = await resolveProduct(enterpriseId, clean(item.product));
    } catch (error) {
      if (!(Number(item.rate) > 0)) throw error;
    }
    const rate = Number(item.rate) > 0 ? Number(item.rate) : Number(product?.Unit_Price ?? 0);
    if (!(rate > 0)) throw new Error(`Zoho Product “${item.product}” has no usable price.`);
    resolvedItems.push({
      productId: product?.id,
      description: clean(item.description) || clean(product?.Description) || clean(product?.Product_Name) || clean(item.product),
      quantity: Math.max(1, Number(item.quantity) || 1),
      rate,
    });
  }

  const dealName = clean(request.dealName) || `${company} - Quotation`;
  let dealId = existing?.deal_id as string | undefined;
  if (!dealId) {
    const deals = await searchRecordsByWord(enterpriseId, "Deals", dealName);
    dealId = deals.find((deal) =>
      normalized(deal.Deal_Name) === normalized(dealName) &&
      (!deal.Account_Name?.id || deal.Account_Name.id === accountId)
    )?.id;
    if (!dealId) {
      const closingDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const dealStage = await resolveDealStage(enterpriseId);
      dealId = (await createRecord(enterpriseId, "Deals", {
        Deal_Name: dealName,
        Account_Name: { id: accountId },
        Contact_Name: { id: contactId },
        Stage: dealStage,
        Closing_Date: closingDate,
        Description: `Quotation requested through Ellipse for ${request.customer.name}.`,
      })) || undefined;
    }
    if (!dealId) throw new Error("Zoho did not create the Deal required by the quotation");
    await stateRef.set({ deal_id: dealId }, { merge: true });
  }

  const { createQuotationPdf } = await import("./quotations");
  const quotation = await createQuotationPdf({
    enterpriseId,
    agentId: request.agentId,
    agentLabel: "Ivy Agent",
    logo: "/logos/zoho.png",
    client: {
      name: company,
      address: billingCity,
      tin: clientTin,
      contact_person: request.customer.name,
      contact_no: clean(request.customer.phone),
      email,
    },
    items: resolvedItems.map((item) => ({
      description: String(item.description),
      rate: Number(item.rate),
      qty: Number(item.quantity),
    })),
    currency: clean(request.currency) || "UGX",
    vatExempt: Boolean(request.vatExempt),
    preparedBy: clean(request.preparedBy),
    bankDetails: clean(request.bankDetails),
    date: clean(request.quoteDate),
    title: clean(request.subject) || `Quotation for ${company}`,
    source: {
      system: "zoho_ellipse_hybrid",
      module: "Deals",
      deal_id: dealId,
      lead_id: leadId,
      account_id: accountId,
      contact_id: contactId,
      workflow_key: request.workflowKey,
      connection_scope: connectionOwnerUid ? "personal" : "org",
      owner_uid: connectionOwnerUid ?? null,
    },
  });
  await stateRef.set({
    status: "complete",
    deal_id: dealId,
    document_id: quotation.id,
    completed_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { dealId, documentId: quotation.id, fileName: quotation.name, url: quotation.url };
}
