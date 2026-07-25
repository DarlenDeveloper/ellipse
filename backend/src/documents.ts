import { randomUUID } from "crypto";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import ExcelJS from "exceljs";
import { db, bucket, FieldValue } from "./admin";

/**
 * On-demand documents created by agents (Word / Excel) and saved to the
 * workspace's Data page. Unlike periodic reports, these are generated in a chat
 * ("draft a quote", "export these leads") and land in the `documents` collection.
 *
 * Saving to our own storage is internal (no external side effect), so it does
 * not go through the approval gate. Pushing a document into a customer's
 * Microsoft 365 remains a separate, gated action.
 */

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type CreatedDocument = {
  id: string;
  name: string;
  url: string;
  type: "docx" | "xlsx";
  size: number;
  storage_path: string;
  content_type: string;
};

async function buildDocx(orgName: string, title: string, body: string): Promise<Buffer> {
  const paras = body
    .split(/\n+/)
    .filter(Boolean)
    .map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line.replace(/^[-*]\s*/, "• "), size: 22 })],
          spacing: { after: 120 },
        })
    );
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: orgName, bold: true, size: 26, color: "111111" })] }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: title, bold: true })],
            spacing: { after: 200 },
          }),
          ...paras,
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function buildXlsx(orgName: string, title: string, headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = orgName;
  const ws = wb.addWorksheet("Sheet1");
  if (title) {
    ws.mergeCells(1, 1, 1, Math.max(headers.length, 1));
    ws.getCell("A1").value = title;
    ws.getCell("A1").font = { bold: true, size: 14 };
    ws.addRow([]);
  }
  if (headers.length) {
    const h = ws.addRow(headers);
    h.font = { bold: true };
    h.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F1" } };
    });
  }
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((col) => (col.width = 24));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function uploadDocument(
  enterpriseId: string,
  docId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<{ url: string; path: string }> {
  const b = bucket();
  const path = `documents/${enterpriseId}/${docId}/${filename}`;
  const token = randomUUID();
  await b.file(path).save(buffer, {
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    resumable: false,
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${b.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  return { url, path };
}

async function uploadAndRecord(
  enterpriseId: string,
  agentId: string,
  agentLabel: string,
  logo: string | undefined,
  title: string,
  kind: "docx" | "xlsx",
  buffer: Buffer,
  contentType: string
): Promise<CreatedDocument> {
  const safe = title.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "document";
  const docRef = db.collection("documents").doc();
  const docId = docRef.id;
  const filename = `${safe}.${kind}`;
  const { url, path } = await uploadDocument(enterpriseId, docId, filename, buffer, contentType);
  await docRef.set({
    enterprise_id: enterpriseId,
    agent: agentId,
    agent_label: agentLabel,
    logo: logo ?? "",
    title,
    kind,
    file: { name: filename, url, type: kind, size: buffer.length },
    created_at: FieldValue.serverTimestamp(),
  });
  return { id: docId, name: filename, url, type: kind, size: buffer.length, storage_path: path, content_type: contentType };
}

/**
 * Deterministic CRM report: builds a multi-sheet Excel (Summary + Leads + Deals
 * + Contacts) straight from real Zoho rows — the AI never writes the figures.
 * Returns the created document(s).
 */
export async function createCrmReport(opts: {
  enterpriseId: string;
  agentId: string;
  agentLabel: string;
  logo?: string;
  periodLabel: string;
  data: {
    counts: Record<string, number>;
    leads: { name: string; company: string; email: string; source: string; status: string; created: string }[];
    deals: { name: string; stage: string; amount: number; closing: string; created: string }[];
    contacts: { name: string; email: string; account: string; created: string }[];
    quotes?: {
      subject: string;
      account: string;
      proforma: string;
      quote_date: string;
      owner: string;
      deal: string;
      stage: string;
      sub_total: number;
    }[];
  };
}): Promise<CreatedDocument[]> {
  const entSnap = await db.doc(`enterprises/${opts.enterpriseId}`).get();
  const orgName = (entSnap.data()?.name as string) || "Company";
  const title = `CRM Report — ${opts.periodLabel}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = orgName;

  // Summary sheet
  const sum = wb.addWorksheet("Summary");
  sum.mergeCells("A1:B1");
  sum.getCell("A1").value = `${orgName} — CRM Report (${opts.periodLabel})`;
  sum.getCell("A1").font = { bold: true, size: 14 };
  sum.addRow([]);
  const metricRows: [string, number][] = [
    ["New leads", opts.data.counts.new_leads ?? 0],
    ["New contacts", opts.data.counts.new_contacts ?? 0],
    ["New deals", opts.data.counts.new_deals ?? 0],
    ["Deals won", opts.data.counts.deals_won ?? 0],
    ["Revenue won", opts.data.counts.revenue_won ?? 0],
    ["Open deals", opts.data.counts.open_deals ?? 0],
    ["Open pipeline value", opts.data.counts.open_pipeline_value ?? 0],
  ];
  const mh = sum.addRow(["Metric", "Value"]);
  mh.font = { bold: true };
  for (const [k, v] of metricRows) sum.addRow([k, v]);
  sum.columns = [{ width: 26 }, { width: 20 }];

  // Leads sheet
  const ls = wb.addWorksheet("Leads");
  const lh = ls.addRow(["Name", "Company", "Email", "Source", "Status", "Created"]);
  lh.font = { bold: true };
  for (const l of opts.data.leads) ls.addRow([l.name, l.company, l.email, l.source, l.status, l.created]);
  ls.columns = [{ width: 26 }, { width: 24 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 14 }];

  // Deals sheet
  const ds = wb.addWorksheet("Deals");
  const dh = ds.addRow(["Deal", "Stage", "Amount", "Closing date", "Created"]);
  dh.font = { bold: true };
  for (const d of opts.data.deals) ds.addRow([d.name, d.stage, d.amount, d.closing, d.created]);
  ds.columns = [{ width: 30 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 14 }];

  // Contacts sheet
  const cs = wb.addWorksheet("Contacts");
  const ch = cs.addRow(["Name", "Email", "Account", "Created"]);
  ch.font = { bold: true };
  for (const c of opts.data.contacts) cs.addRow([c.name, c.email, c.account, c.created]);
  cs.columns = [{ width: 26 }, { width: 30 }, { width: 24 }, { width: 14 }];

  // Quotes sheet (detailed) — the client's exact columns.
  if (opts.data.quotes && opts.data.quotes.length) {
    const qs = wb.addWorksheet("Quotes (detailed)");
    const qh = qs.addRow(["Subject", "Account Name", "Proforma No.", "Quote Date", "Quote Owner", "Deal Name", "Quote Stage", "Sub Total"]);
    qh.font = { bold: true };
    qh.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F1" } }));
    for (const q of opts.data.quotes) {
      qs.addRow([q.subject, q.account, q.proforma, q.quote_date, q.owner, q.deal, q.stage, q.sub_total]);
    }
    qs.columns = [{ width: 30 }, { width: 24 }, { width: 16 }, { width: 14 }, { width: 20 }, { width: 24 }, { width: 18 }, { width: 16 }];
    // Open the workbook on the detailed line-items so it's immediately visible.
    wb.views = [
      {
        x: 0,
        y: 0,
        width: 10000,
        height: 20000,
        firstSheet: 0,
        activeTab: wb.worksheets.length - 1,
        visibility: "visible",
      },
    ];
  }

  const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer());
  const xlsx = await uploadAndRecord(
    opts.enterpriseId,
    opts.agentId,
    opts.agentLabel,
    opts.logo,
    title,
    "xlsx",
    xlsxBuf,
    XLSX_TYPE
  );
  return [xlsx];
}

/**
 * Generic multi-sheet report workbook — used for Website and messaging-channel
 * reports (CRM has its own richer builder). Numbers come straight from the
 * caller's gathered data.
 */
export async function createReportWorkbook(opts: {
  enterpriseId: string;
  agentId: string;
  agentLabel: string;
  logo?: string;
  title: string;
  summary: { label: string; value: string | number }[];
  sheets: { name: string; headers: string[]; rows: (string | number)[][] }[];
}): Promise<CreatedDocument> {
  const entSnap = await db.doc(`enterprises/${opts.enterpriseId}`).get();
  const orgName = (entSnap.data()?.name as string) || "Company";

  const wb = new ExcelJS.Workbook();
  wb.creator = orgName;

  const sum = wb.addWorksheet("Summary");
  sum.mergeCells("A1:B1");
  sum.getCell("A1").value = `${orgName} — ${opts.title}`;
  sum.getCell("A1").font = { bold: true, size: 14 };
  sum.addRow([]);
  const mh = sum.addRow(["Metric", "Value"]);
  mh.font = { bold: true };
  for (const m of opts.summary) sum.addRow([m.label, m.value]);
  sum.columns = [{ width: 28 }, { width: 22 }];

  for (const sheet of opts.sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    const h = ws.addRow(sheet.headers);
    h.font = { bold: true };
    h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F1" } }));
    for (const r of sheet.rows) ws.addRow(r);
    ws.columns = sheet.headers.map(() => ({ width: 24 }));
  }

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return uploadAndRecord(opts.enterpriseId, opts.agentId, opts.agentLabel, opts.logo, opts.title, "xlsx", buf, XLSX_TYPE);
}

/** Create a document and save it to the Data page. Returns file info. */
export async function createDocument(opts: {
  enterpriseId: string;
  agentId: string;
  agentLabel: string;
  logo?: string;
  title: string;
  kind: "docx" | "xlsx";
  body?: string;
  headers?: string[];
  rows?: (string | number)[][];
}): Promise<CreatedDocument> {
  const entSnap = await db.doc(`enterprises/${opts.enterpriseId}`).get();
  const orgName = (entSnap.data()?.name as string) || "Company";

  const safe = opts.title.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "document";
  const docRef = db.collection("documents").doc();
  const docId = docRef.id;

  let buffer: Buffer;
  let filename: string;
  let contentType: string;
  if (opts.kind === "xlsx") {
    buffer = await buildXlsx(orgName, opts.title, opts.headers ?? [], opts.rows ?? []);
    filename = `${safe}.xlsx`;
    contentType = XLSX_TYPE;
  } else {
    buffer = await buildDocx(orgName, opts.title, opts.body ?? "");
    filename = `${safe}.docx`;
    contentType = DOCX_TYPE;
  }

  const { url, path } = await uploadDocument(opts.enterpriseId, docId, filename, buffer, contentType);

  await docRef.set({
    enterprise_id: opts.enterpriseId,
    agent: opts.agentId,
    agent_label: opts.agentLabel,
    logo: opts.logo ?? "",
    title: opts.title,
    kind: opts.kind,
    file: { name: filename, url, type: opts.kind, size: buffer.length },
    storage_path: path,
    content_type: contentType,
    created_at: FieldValue.serverTimestamp(),
  });

  return { id: docId, name: filename, url, type: opts.kind, size: buffer.length, storage_path: path, content_type: contentType };
}
