import { db } from "../admin";

/**
 * Loads the enterprise's knowledge base entries as a single text block for
 * injection into agent prompts. Returns "" if there are none.
 */
export async function loadKnowledgeBase(enterpriseId: string): Promise<string> {
  const snap = await db
    .collection("knowledge_base")
    .where("enterprise_id", "==", enterpriseId)
    .get();
  if (snap.empty) return "";

  const PER_ENTRY_CAP = 6000; // keep any single file from dominating the prompt
  const TOTAL_CAP = 24000;

  const entries = snap.docs
    .map((d) => d.data() as { title?: string; content?: string; source?: string })
    .filter((e) => e.content)
    .map((e) => {
      const body = e.content!.length > PER_ENTRY_CAP ? `${e.content!.slice(0, PER_ENTRY_CAP)}…` : e.content!;
      const tag = e.source === "file" ? " (from uploaded file)" : "";
      return `- ${e.title ?? "Note"}${tag}: ${body}`;
    });

  return entries.join("\n").slice(0, TOTAL_CAP);
}
