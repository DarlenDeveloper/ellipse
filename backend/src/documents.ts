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
    created_at: FieldValue.serverTimestamp(),
  });

  return { id: docId, name: filename, url, type: opts.kind, size: buffer.length, storage_path: path, content_type: contentType };
}
