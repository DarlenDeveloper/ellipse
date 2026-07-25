import { GoogleGenAI } from "@google/genai";
import * as logger from "firebase-functions/logger";

// Flash-class model for agent reasoning + function calling.
// Override with GEMINI_MODEL env if/when a newer flash id (e.g. a 3.1 text model) is GA.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export type GeminiResult = {
  text: string;
  functionCalls: { name: string; args: Record<string, unknown> }[];
  usageTokens: number;
};

/**
 * Single wrapper for all Gemini calls. Supports plain reasoning and function
 * calling (tools). Every agent goes through this so behavior stays consistent.
 */
export async function callGemini(opts: {
  system?: string;
  prompt: string;
  tools?: { name: string; description: string; parameters: Record<string, unknown> }[];
  temperature?: number;
}): Promise<GeminiResult> {
  const ai = getClient();

  const config: Record<string, unknown> = {};
  if (opts.system) config.systemInstruction = opts.system;
  if (typeof opts.temperature === "number") config.temperature = opts.temperature;
  if (opts.tools && opts.tools.length) {
    config.tools = [{ functionDeclarations: opts.tools }];
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: opts.prompt,
    config,
  });

  const functionCalls =
    response.functionCalls?.map((fc) => ({
      name: fc.name ?? "",
      args: (fc.args as Record<string, unknown>) ?? {},
    })) ?? [];

  const usageTokens = response.usageMetadata?.totalTokenCount ?? 0;

  logger.info("Gemini call", { model: GEMINI_MODEL, usageTokens, functionCalls: functionCalls.length });

  return {
    text: response.text ?? "",
    functionCalls,
    usageTokens,
  };
}

/**
 * Extract the full text of an uploaded document (PDF/image) using Gemini's
 * multimodal input. Used to ingest knowledge-base files (e.g. sample quotations)
 * into plain text the agents can read. Returns "" on failure.
 */
export async function extractTextFromFile(base64: string, mimeType: string): Promise<string> {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            {
              text:
                "Extract ALL text from this document as clean plain text. Preserve structure: " +
                "headings, labelled fields, line items and tables (render tables as readable rows with their columns), " +
                "and any totals. Do NOT summarise, add, infer, or omit anything — transcribe verbatim. " +
                "Output only the extracted text.",
            },
          ],
        },
      ],
      config: { temperature: 0 },
    });
    return response.text ?? "";
  } catch (e) {
    logger.error("extractTextFromFile failed", { mimeType, error: (e as Error).message });
    return "";
  }
}
