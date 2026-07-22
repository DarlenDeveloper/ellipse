import { randomUUID } from "crypto";
import * as logger from "firebase-functions/logger";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import ExcelJS from "exceljs";
import { bucket } from "./admin";

/**
 * Turns a report into real, downloadable company documents:
 *   - a Word (.docx) narrative every time
 *   - an Excel (.xlsx) whenever there's tabular data (e.g. leads captured)
 *
 * Files are uploaded to Cloud Storage under reports/{enterpriseId}/{reportId}/
 * and exposed via a Firebase download token (no signing needed).
 */

export type ReportFile = {
  name: string;
  url: string;
  type: "docx" | "xlsx";
  size: number;
  storage_path?: string;
  onedrive_url?: string; // set once mirrored to the customer's Microsoft 365
  onedrive_status?: "pending" | "executed"; // gate state for the mirror action
};

const ONEDRIVE_FOLDER = "Ellipse Reports";

export type LeadRow = {
  contact: string;
  channel: string;
  subject: string;
  captured: string;
};

async function upload(
  enterpriseId: string,
  reportId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<{ url: string; size: number; path: string }> {
  const b = bucket();
  const path = `reports/${enterpriseId}/${reportId}/${filename}`;
  const file = b.file(path);
  const token = randomUUID();
  await file.save(buffer, {
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    resumable: false,
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${b.name}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
  return { url, size: buffer.length, path };
}

// ---------------------------------------------------------------------------
// DOCX — the narrative report
// ---------------------------------------------------------------------------

export async function buildReportDocx(opts: {
  orgName: string;
  agentLabel: string;
  title: string;
  periodLabel: string;
  periodTitle: string;
  metrics: Record<string, number>;
  summary: string;
}): Promise<Buffer> {
  const metricRows = Object.entries(opts.metrics).map(
    ([k, v]) =>
      new TableRow({
        children: [
          cell(k.replace(/_/g, " "), false),
          cell(String(v), true),
        ],
      })
  );

  const summaryParas = opts.summary
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
          new Paragraph({
            children: [new TextRun({ text: opts.orgName, bold: true, size: 28, color: "111111" })],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `${opts.agentLabel} · ${opts.periodTitle} report`, size: 20, color: "666666" }),
            ],
            spacing: { after: 80 },
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: opts.title, bold: true })],
            spacing: { after: 40 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Period covered: ${opts.periodLabel}`, italics: true, size: 20, color: "888888" })],
            spacing: { after: 240 },
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "Key metrics", bold: true })],
            spacing: { after: 120 },
          }),
          metricRows.length
            ? new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: metricRows,
              })
            : new Paragraph({ children: [new TextRun({ text: "No activity recorded.", size: 22 })] }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "Summary", bold: true })],
            spacing: { before: 280, after: 120 },
          }),
          ...summaryParas,
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function cell(text: string, bold: boolean): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: thinBorders(),
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 22 })],
      }),
    ],
  });
}

function thinBorders() {
  const b = { style: BorderStyle.SINGLE, size: 2, color: "E5E5E5" };
  return { top: b, bottom: b, left: b, right: b };
}

// ---------------------------------------------------------------------------
// XLSX — tabular data (leads captured, etc.)
// ---------------------------------------------------------------------------

export async function buildLeadsXlsx(opts: {
  orgName: string;
  agentLabel: string;
  periodLabel: string;
  leads: LeadRow[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = opts.orgName;
  const ws = wb.addWorksheet("Leads");

  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = `${opts.orgName} — Leads captured (${opts.periodLabel})`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.addRow([]);

  const header = ws.addRow(["Contact", "Channel", "Subject", "Captured"]);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F1" } };
  });

  for (const l of opts.leads) {
    ws.addRow([l.contact, l.channel, l.subject, l.captured]);
  }

  ws.columns = [
    { width: 34 },
    { width: 16 },
    { width: 48 },
    { width: 18 },
  ];

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function generateReportFiles(opts: {
  enterpriseId: string;
  reportId: string;
  orgName: string;
  agentLabel: string;
  title: string;
  periodLabel: string;
  periodTitle: string;
  metrics: Record<string, number>;
  summary: string;
  leads: LeadRow[];
}): Promise<ReportFile[]> {
  const files: ReportFile[] = [];
  const safe = opts.title.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");

  // Mirror to Microsoft 365 only when the customer has it connected — and route
  // that external upload through the approval gate (so supervised mode queues it).
  const { isMicrosoftConnected } = await import("./connections/microsoft365");
  const { executeAgentAction } = await import("./executeAgentAction");
  let msConnected = false;
  try {
    msConnected = await isMicrosoftConnected(opts.enterpriseId);
  } catch {
    msConnected = false;
  }

  const emit = async (filename: string, buffer: Buffer, type: "docx" | "xlsx", contentType: string) => {
    const file: ReportFile = { name: filename, url: "", type, size: buffer.length };
    try {
      const { url, size, path } = await upload(opts.enterpriseId, opts.reportId, filename, buffer, contentType);
      file.url = url;
      file.size = size;
      file.storage_path = path;
    } catch (e) {
      logger.error("storage upload failed", { filename, error: (e as Error).message });
    }

    // Saving to the customer's Microsoft 365 is an external agent action → gate it.
    if (msConnected && file.storage_path) {
      try {
        const res = await executeAgentAction({
          enterpriseId: opts.enterpriseId,
          agentId: "microsoft365-agent",
          domain: "files",
          actionType: "save_file",
          params: {
            fileName: filename,
            folder: ONEDRIVE_FOLDER,
            storagePath: file.storage_path,
            contentType,
            reportId: opts.reportId,
          },
          targetSystem: "microsoft365",
          reasoning: `Save "${filename}" to Microsoft 365 (Ellipse Reports).`,
        });
        if (res.status === "executed") {
          file.onedrive_url = res.externalRef;
          file.onedrive_status = "executed";
        } else if (res.status === "pending") {
          file.onedrive_status = "pending"; // awaiting human approval
        }
      } catch (e) {
        logger.warn("onedrive gate action failed", { filename, error: (e as Error).message });
      }
    }
    files.push(file);
  };

  try {
    const docxBuf = await buildReportDocx(opts);
    await emit(`${safe}.docx`, docxBuf, "docx", DOCX_TYPE);
  } catch (e) {
    logger.error("docx generation failed", { error: (e as Error).message });
  }

  if (opts.leads.length > 0) {
    try {
      const xlsxBuf = await buildLeadsXlsx(opts);
      await emit(`${safe}_leads.xlsx`, xlsxBuf, "xlsx", XLSX_TYPE);
    } catch (e) {
      logger.error("xlsx generation failed", { error: (e as Error).message });
    }
  }

  return files;
}
