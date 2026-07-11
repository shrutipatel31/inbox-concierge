import { GoogleGenAI, Type } from "@google/genai";
import type { Bucket } from "./buckets";
import type { Thread, Classification } from "./types";
import {
  buildSystemPrompt,
  toBatchInput,
  FEW_SHOT_INPUT,
  FEW_SHOT_OUTPUT,
} from "./prompt";

// Pinned models (not "-latest" aliases) so classification stays reproducible
// across runs — pairs with temperature 0 below. Cheap model by default;
// escalate the ambiguous tail to the stronger one (see pipeline.ts).
export const DEFAULT_MODEL = "gemini-3.1-flash-lite";
export const ESCALATION_MODEL = "gemini-3.5-flash";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/**
 * Structured-output schema. The `bucket` enum is built from the current bucket
 * set so the model can only return a valid bucket name (custom buckets flow in
 * here automatically once they exist).
 */
function buildResponseSchema(names: string[]) {
  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        threadId: { type: Type.STRING },
        bucket: { type: Type.STRING, enum: names },
        confidence: { type: Type.NUMBER },
        reason: { type: Type.STRING },
      },
      required: ["threadId", "bucket", "confidence", "reason"],
      propertyOrdering: ["threadId", "bucket", "confidence", "reason"],
    },
  };
}

function parseClassifications(
  text: string | undefined,
  names: string[],
): Classification[] {
  if (!text) throw new Error("Empty response from model");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`Model did not return valid JSON: ${text.slice(0, 200)}`);
  }
  if (!Array.isArray(raw)) {
    throw new Error("Model response was not a JSON array");
  }
  const allowed = new Set(names);
  return raw.map((item, i): Classification => {
    const o = item as Record<string, unknown>;
    const threadId = typeof o.threadId === "string" ? o.threadId : "";
    const bucket =
      typeof o.bucket === "string" && allowed.has(o.bucket) ? o.bucket : "";
    const confidence = typeof o.confidence === "number" ? o.confidence : 0;
    const reason = typeof o.reason === "string" ? o.reason : "";
    if (!threadId || !bucket) {
      throw new Error(
        `Invalid classification at index ${i}: ${JSON.stringify(item)}`,
      );
    }
    return { threadId, bucket, confidence, reason };
  });
}

export interface BatchResult {
  classifications: Classification[];
  // Tokens served from Gemini's implicit prefix cache on this call (0 if none).
  cachedTokens: number;
}

/**
 * Classify one batch of threads into the given buckets with a single Gemini
 * call. System prompt + few-shot are the cache-eligible constant; only the
 * batch's email list varies. `model` lets the pipeline route the low-confidence
 * tail to a stronger model.
 */
export async function classifyBatch(
  threads: Thread[],
  buckets: Bucket[],
  model: string = DEFAULT_MODEL,
): Promise<BatchResult> {
  if (threads.length === 0) return { classifications: [], cachedTokens: 0 };
  const names = buckets.map((b) => b.name);
  const ai = getClient();

  const response = await ai.models.generateContent({
    model,
    config: {
      systemInstruction: buildSystemPrompt(buckets),
      responseMimeType: "application/json",
      responseSchema: buildResponseSchema(names),
      temperature: 0,
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: `Classify these emails:\n${JSON.stringify(FEW_SHOT_INPUT)}` },
        ],
      },
      { role: "model", parts: [{ text: JSON.stringify(FEW_SHOT_OUTPUT) }] },
      {
        role: "user",
        parts: [
          {
            text: `Classify these emails:\n${JSON.stringify(toBatchInput(threads))}`,
          },
        ],
      },
    ],
  });

  return {
    classifications: parseClassifications(response.text, names),
    cachedTokens: response.usageMetadata?.cachedContentTokenCount ?? 0,
  };
}

/**
 * Turn a bare bucket name into a one-line description for the classifier prompt
 * (used when the user adds a custom bucket without one). Kept short and plain.
 */
export async function generateBucketDescription(name: string): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    config: { temperature: 0.2 },
    contents: `You are naming email-inbox buckets. In one sentence (max ~20 words), describe what kinds of emails belong in a bucket called "${name}". Reply with only the description, no label or quotes.`,
  });
  return (response.text ?? "").trim();
}
