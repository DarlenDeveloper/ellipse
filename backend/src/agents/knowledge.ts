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

  const entries = snap.docs
    .map((d) => d.data() as { title?: string; content?: string })
    .filter((e) => e.content)
    .map((e) => `- ${e.title ?? "Note"}: ${e.content}`);

  return entries.join("\n");
}
