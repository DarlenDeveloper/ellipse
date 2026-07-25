import { randomUUID } from "crypto";
import PDFDocument from "pdfkit";
import { db, bucket, FieldValue } from "./admin";

/**
 * Deterministic proforma-invoice / quotation PDF generator.
 *
 * The AI supplies structured data (client + line items); the numbers (amounts,
 * subtotal, VAT, total) are computed here in code — never authored by the model.
 * Layout mirrors the client's proforma: branded letterhead, line-item table,
 * subtotal / VAT / total, prepared-by and terms.
 */

const PDF_TYPE = "application/pdf";

export type QuotationBranding = {
  company_name: string;
  tin?: string;
  address?: string;
  phones?: string;
  email?: string;
  website?: string;
  prepared_by?: string;
  vat_rate?: number; // percent, e.g. 18
  review_link?: string;
  terms?: string; // newline-separated
  proforma_prefix?: string; // e.g. "MCL"
  logo_url?: string;
  logo_path?: string;
};

export type QuotationClient = {
  name?: string;
  address?: string;
  tin?: string;
  contact_person?: string;
  contact_no?: string;
  email?: string;
};

export type QuotationItem = { description: string; rate: number; qty: number };

export async function loadQuotationBranding(enterpriseId: string): Promise<QuotationBranding> {
  const snap = await db.doc(`quotation_settings/${enterpriseId}`).get();
  const d = (snap.data() as QuotationBranding | undefined) ?? ({} as QuotationBranding);
  // Fall back to the enterprise name if no company name set.
  if (!d.company_name) {
    const ent = await db.doc(`enterprises/${enterpriseId}`).get();
    d.company_name = (ent.data()?.name as string) || "Company";
  }
  return d;
}

/** Next proforma number, e.g. MCL/26/Jul/04799. Sequence increments atomically. */
async function nextProformaNumber(enterpriseId: string, prefix: string): Promise<string> {
  const ref = db.doc(`quotation_settings/${enterpriseId}`);
  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = (snap.data()?.proforma_seq as number | undefined) ?? 0;
    const next = cur + 1;
    tx.set(ref, { proforma_seq: next }, { merge: true });
    return next;
  });
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mon = now.toLocaleString("en-US", { month: "short" });
  return `${prefix}/${yy}/${mon}/${String(seq).padStart(5, "0")}`;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function loadLogoBuffer(logoPath?: string): Promise<Buffer | null> {
  if (!logoPath) return null;
  try {
    const [buf] = await bucket().file(logoPath).download();
    return buf;
  } catch {
    return null;
  }
}

export type CreatedQuotation = {
  id: string;
  name: string;
  url: string;
  type: "pdf";
  size: number;
  proforma_no: string;
  total: number;
  currency: string;
};

export async function createQuotationPdf(opts: {
  enterpriseId: string;
  agentId: string;
  agentLabel: string;
  logo?: string; // system logo shown on the Data-page card
  client: QuotationClient;
  items: QuotationItem[];
  currency?: string; // default UGX
  vatExempt?: boolean;
  vatRate?: number; // override branding
  preparedBy?: string;
  date?: string; // MM/DD/YYYY; default today
  title?: string;
}): Promise<CreatedQuotation> {
  const branding = await loadQuotationBranding(opts.enterpriseId);
  const currency = opts.currency || "UGX";
  const vatRate = opts.vatExempt ? 0 : opts.vatRate ?? branding.vat_rate ?? 18;

  const items = (opts.items || []).map((i) => ({
    description: String(i.description ?? ""),
    rate: Number(i.rate) || 0,
    qty: Number(i.qty) || 0,
  }));
  const lineAmount = (i: QuotationItem) => i.rate * i.qty;
  const subtotal = items.reduce((s, i) => s + lineAmount(i), 0);
  const vat = subtotal * (vatRate / 100);
  const total = subtotal + vat;

  const prefix = branding.proforma_prefix || "MCL";
  const proformaNo = await nextProformaNumber(opts.enterpriseId, prefix);
  const dateStr = opts.date || new Date().toLocaleDateString("en-US");
  const logoBuf = await loadLogoBuffer(branding.logo_path);

  const buffer = await renderPdf({
    branding,
    client: opts.client || {},
    items,
    currency,
    vatRate,
    subtotal,
    vat,
    total,
    proformaNo,
    dateStr,
    preparedBy: opts.preparedBy || branding.prepared_by || "",
    logoBuf,
    vatExempt: !!opts.vatExempt || vatRate === 0,
  });

  // Store + record on the Data page.
  const docRef = db.collection("documents").doc();
  const docId = docRef.id;
  const filename = `Proforma_${proformaNo.replace(/[^\w]+/g, "_")}.pdf`;
  const path = `documents/${opts.enterpriseId}/${docId}/${filename}`;
  const b = bucket();
  const token = randomUUID();
  await b.file(path).save(buffer, {
    contentType: PDF_TYPE,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    resumable: false,
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${b.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

  await docRef.set({
    enterprise_id: opts.enterpriseId,
    agent: opts.agentId,
    agent_label: opts.agentLabel,
    logo: opts.logo ?? "",
    title: opts.title || `Proforma Invoice ${proformaNo}`,
    kind: "pdf",
    file: { name: filename, url, type: "pdf", size: buffer.length },
    storage_path: path,
    content_type: PDF_TYPE,
    quotation: { proforma_no: proformaNo, client: opts.client?.name ?? "", total, currency },
    created_at: FieldValue.serverTimestamp(),
  });

  return { id: docId, name: filename, url, type: "pdf", size: buffer.length, proforma_no: proformaNo, total, currency };
}

function renderPdf(p: {
  branding: QuotationBranding;
  client: QuotationClient;
  items: QuotationItem[];
  currency: string;
  vatRate: number;
  subtotal: number;
  vat: number;
  total: number;
  proformaNo: string;
  dateStr: string;
  preparedBy: string;
  logoBuf: Buffer | null;
  vatExempt: boolean;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { branding, client, items, currency, vatRate, subtotal, vat, total } = p;
    const LEFT = 40;
    const RIGHT = 555; // 595.28 page width - 40 margin
    const GRAY = "#666666";
    const DARK = "#111111";

    const cur = (n: number) => `${currency} ${money(n)}`;

    // ------------------------------------------------------------------ Header
    const headerTop = 42;
    if (p.logoBuf) {
      try {
        doc.image(p.logoBuf, LEFT, headerTop, { fit: [140, 84] });
      } catch {
        /* ignore bad image */
      }
    }

    // Center company block
    const cX = 200;
    doc.fillColor(DARK).font("Helvetica-Bold").fontSize(13).text(branding.company_name || "", cX, headerTop, { width: 195 });
    doc.font("Helvetica").fontSize(9).fillColor("#333333");
    if (branding.tin) {
      doc.font("Helvetica-Bold").text("TIN NO: ", cX, doc.y + 3, { continued: true }).font("Helvetica").text(branding.tin);
    }
    if (branding.address) doc.text(branding.address, cX, doc.y + 1, { width: 195 });
    if (branding.phones) doc.text(branding.phones, cX, doc.y + 6, { width: 195 });
    if (branding.email) doc.fillColor("#1a56db").text(branding.email, cX, doc.y + 1, { width: 195 }).fillColor("#333333");
    if (branding.website) doc.fillColor("#1a56db").text(branding.website, cX, doc.y + 1, { width: 195 }).fillColor("#333333");
    const centerBottom = doc.y;

    // Right invoice block
    const rX = 405;
    doc.fillColor(DARK).font("Helvetica-Bold").fontSize(13).text("PROFORMA INVOICE", rX, headerTop, { width: RIGHT - rX });
    doc.font("Helvetica").fontSize(9).fillColor("#333333").text(p.proformaNo, rX, doc.y + 3, { width: RIGHT - rX });
    doc.text(`DATE: ${p.dateStr}`, rX, doc.y + 8, { width: RIGHT - rX });
    doc.font("Helvetica-Bold").fillColor(DARK).text("TOTAL: ", rX, doc.y + 10, { continued: true }).font("Helvetica").text(cur(total));
    const rightBottom = doc.y;

    // Divider
    let y = Math.max(centerBottom, rightBottom, headerTop + 90) + 14;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1).strokeColor("#dddddd").stroke();
    y += 14;

    // ------------------------------------------------------------ Client block
    const labeled = (label: string, value: string | undefined, x: number, yy: number, w: number) => {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text(`${label} `, x, yy, { continued: true, width: w });
      doc.font("Helvetica").fillColor("#333333").text(value || "");
      return doc.y;
    };
    const colLy = y;
    let ly = labeled("Client :", client.name, LEFT, colLy, 260);
    ly = labeled("Address :", client.address, LEFT, ly + 2, 260);
    ly = labeled("TIN :", client.tin, LEFT, ly + 2, 260);
    let ry = labeled("Contact Person:", client.contact_person, 320, colLy, 235);
    ry = labeled("Contact NO:", client.contact_no, 320, ry + 2, 235);
    ry = labeled("Email:", client.email, 320, ry + 2, 235);
    y = Math.max(ly, ry) + 16;

    // ------------------------------------------------------------- Items table
    const colDescX = LEFT;
    const colRateX = 290;
    const colQtyX = 400;
    const colAmtX = 460;
    const descW = colRateX - colDescX - 10;
    const rateW = colQtyX - colRateX - 10;
    const qtyW = colAmtX - colQtyX - 10;
    const amtW = RIGHT - colAmtX;

    // Header row
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY);
    doc.text("DESCRIPTION", colDescX, y, { width: descW });
    doc.text("RATE", colRateX, y, { width: rateW });
    doc.text("QTY", colQtyX, y, { width: qtyW });
    doc.text("AMOUNT", colAmtX, y, { width: amtW, align: "right" });
    y += 16;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1).strokeColor("#e5e5e5").stroke();
    y += 10;

    for (const it of items) {
      const amount = it.rate * it.qty;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK);
      const descH = doc.heightOfString(it.description, { width: descW });
      doc.text(it.description, colDescX, y, { width: descW });
      doc.font("Helvetica").fontSize(9).fillColor(GRAY);
      doc.text(cur(it.rate), colRateX, y + 1, { width: rateW });
      doc.fillColor("#333333").text(String(it.qty), colQtyX, y + 1, { width: qtyW });
      doc.fillColor(GRAY).text(cur(amount), colAmtX, y + 1, { width: amtW, align: "right" });
      y += Math.max(descH, 14) + 12;
      doc.moveTo(LEFT, y - 6).lineTo(RIGHT, y - 6).lineWidth(0.5).strokeColor("#f0f0f0").stroke();
    }

    // --------------------------------------------------------------- Totals
    y += 4;
    const totalsX = 360;
    const totalsValX = 460;
    if (p.vatExempt) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text("WITHHOLDING TAX & VAT WITHHOLDING TAX EXEMPTED", LEFT, y, { width: 300 });
    }
    doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text("SUBTOTAL", totalsX, y, { width: 90 });
    doc.font("Helvetica").fillColor("#333333").text(cur(subtotal), totalsValX, y, { width: amtW, align: "right" });
    y += 18;
    doc.font("Helvetica").fontSize(10).fillColor("#333333").text(`VAT(${vatRate}%)`, totalsX, y, { width: 90 });
    doc.text(cur(vat), totalsValX, y, { width: amtW, align: "right" });
    y += 16;
    doc.moveTo(totalsX, y).lineTo(RIGHT, y).lineWidth(1).strokeColor("#111111").stroke();
    y += 8;
    doc.font("Helvetica-Bold").fontSize(13).fillColor(DARK).text("TOTAL", totalsX, y, { width: 90 });
    doc.text(cur(total), totalsValX - 20, y, { width: amtW + 20, align: "right" });
    y += 34;

    // --------------------------------------------------------------- Footer
    if (branding.review_link) {
      doc.font("Helvetica").fontSize(10).fillColor("#333333").text("Please leave a rating/review on", LEFT, y, { width: 300 });
      doc.fillColor("#1a56db").fontSize(9).text(branding.review_link, LEFT, doc.y + 4, { width: 300, link: branding.review_link, underline: true });
    }
    if (p.preparedBy) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor(DARK).text("Prepared By:", rX, y, { width: RIGHT - rX });
      doc.font("Helvetica").fontSize(10).fillColor("#333333").text(p.preparedBy, rX, doc.y + 2, { width: RIGHT - rX });
    }

    // Terms & Conditions
    const termsY = Math.max(doc.y, y) + 24;
    if (branding.terms) {
      doc.font("Helvetica-Bold").fontSize(13).fillColor(DARK).text("Terms & Conditions", LEFT, termsY);
      doc.font("Helvetica").fontSize(9).fillColor("#333333");
      for (const line of branding.terms.split(/\n+/).filter(Boolean)) {
        doc.text(line.startsWith("-") ? line : `- ${line}`, LEFT, doc.y + 3, { width: RIGHT - LEFT });
      }
    }
    doc.moveTo(LEFT, doc.y + 16).lineTo(RIGHT, doc.y + 16).lineWidth(1).strokeColor("#111111").stroke();

    doc.end();
  });
}
