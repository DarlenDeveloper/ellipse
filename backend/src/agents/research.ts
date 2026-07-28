import * as logger from "firebase-functions/logger";
import { callGemini } from "../gemini";
import { isMercuryConnected, listAllResource } from "../connections/mercury";

const RESEARCH_TOOLS = [
  {
    name: "search_mercury_products",
    description:
      "Search the connected Mercury Store product catalog for verified product names, specifications, prices, and availability. Use this whenever an inbound message asks about a machine, model, product, specifications, price, stock, or availability. Search using the most distinctive model name or SKU from the message.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Concise product model, name, SKU, or distinctive search phrase.",
        },
      },
      required: ["query"],
    },
  },
];

const GENERIC_PRODUCT_WORDS = new Set([
  "a", "an", "the", "for", "with", "product", "products", "computer",
  "computers", "machine", "machines", "laptop", "laptops", "spec", "specs",
  "specification", "specifications", "price", "pricing", "stock", "available",
  "availability",
]);

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Mercury's q endpoint can return the whole catalog, so rank locally as well. */
function relevantProducts(items: unknown[], query: string): unknown[] {
  const tokens = normalize(query)
    .split(" ")
    .filter((token) => token.length > 1 && !GENERIC_PRODUCT_WORDS.has(token));
  if (!tokens.length) return [];

  return items
    .map((item) => {
      const text = normalize(JSON.stringify(item));
      const matched = tokens.filter((token) => text.includes(token)).length;
      const phrase = normalize(query);
      const score = matched * 10 + (phrase && text.includes(phrase) ? 25 : 0);
      return { item, matched, score };
    })
    // Require every distinctive query token so unrelated catalog rows never
    // become evidence for a customer-facing reply.
    .filter((entry) => entry.matched === tokens.length)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

/**
 * Give automatic messaging agents a bounded, read-only research pass.
 * The returned block is evidence for the reply model, never customer-facing text.
 */
export async function researchForReply(
  enterpriseId: string,
  transcript: string
): Promise<string> {
  if (!(await isMercuryConnected(enterpriseId))) return "";

  const planner = await callGemini({
    system: `You are the read-only research planner for an inbound customer-message agent.
Decide whether the message requires verified product information from the connected Mercury Store.
Call search_mercury_products for requests involving a product, computer, machine, model, SKU, specifications, price, stock, or availability.
Do not call it for greetings, scheduling, personal messages, or questions fully answered without product facts.
Never answer the customer and never invent a search result.`,
    prompt: `Recent conversation:\n${transcript.slice(-10000)}`,
    tools: RESEARCH_TOOLS,
    temperature: 0,
  });

  const calls = planner.functionCalls
    .filter((call) => call.name === "search_mercury_products")
    .slice(0, 3);
  if (!calls.length) return "";

  const evidence: string[] = [];
  for (const call of calls) {
    const query = String(call.args.query ?? "").trim().slice(0, 160);
    if (!query) continue;
    try {
      const result = await listAllResource(
        enterpriseId,
        "products",
        { q: query, limit: 100 },
        1000
      );
      const ranked = relevantProducts(result.items, query);
      const items = ranked.slice(0, 12);
      logger.info("reply research: Mercury product search", {
        enterpriseId,
        query,
        apiMatches: result.items.length,
        relevantMatches: ranked.length,
        total: result.total,
      });
      evidence.push(
        JSON.stringify({
          source: "Mercury Store",
          query,
          match_count: ranked.length,
          items,
        }).slice(0, 18000)
      );
    } catch (error) {
      logger.error("reply research: Mercury product search failed", {
        enterpriseId,
        query,
        error: (error as Error).message,
      });
      evidence.push(
        JSON.stringify({
          source: "Mercury Store",
          query,
          error: "The connected product catalog could not be searched.",
        })
      );
    }
  }

  return evidence.join("\n");
}
