import type { Bucket } from "./buckets";
import type { Thread } from "./types";

/**
 * System prompt template (from docs/inbox-concierge-classifier-prompt.md).
 * Bucket definitions and the allowed bucket-name list are injected at runtime
 * so the same prompt serves default and custom buckets. This block is the
 * cache-eligible constant across all batches (only the email list varies).
 */
const SYSTEM_PROMPT_TEMPLATE = `You are an email triage assistant. You classify emails into exactly one bucket each,
the way a sharp executive assistant would when tidying someone's inbox.

## Buckets
Classify each email into exactly ONE of these buckets:

{{BUCKET_DEFINITIONS}}

## Rules
- Choose exactly one bucket per email. Never invent a bucket outside the list above.
- Judge by likely intent and sender, not just keywords. A word like "urgent" in a
  marketing subject line does not make it Important.
- Prefer the most specific fitting bucket. If an email is a newsletter AND promotional,
  use the bucket whose description fits its primary purpose.
- Automated, no-reply, and system-generated mail (receipts, confirmations, alerts) is
  rarely Important unless it needs a human decision or action soon.
- Personal or work mail from a real person that expects a reply or a decision leans Important.
- When genuinely torn between two buckets, pick the better fit and lower your confidence.

## Confidence
Return a confidence from 0 to 1 reflecting how clearly the email fits its bucket:
- 0.9–1.0: unambiguous.
- 0.6–0.89: fits, but a reasonable person might pick another bucket.
- below 0.6: genuinely unsure; the email is borderline or lacks signal.
Be honest — low confidence is useful, not a failure.

## Reason
Give a short reason (max ~12 words) for the chosen bucket. No email quotes.

## Output
Return ONLY a JSON array, one object per input email, in the same order. Each object:
{ "threadId": string, "bucket": string, "confidence": number, "reason": string }
The "bucket" value must be exactly one of: {{BUCKET_NAMES}}.
No prose, no markdown, no code fences — JSON only.`;

export function buildSystemPrompt(buckets: Bucket[]): string {
  const definitions = buckets
    .map((b) => `- **${b.name}**: ${b.description}`)
    .join("\n");
  const names = buckets.map((b) => b.name).join(", ");
  return SYSTEM_PROMPT_TEMPLATE.replace(
    "{{BUCKET_DEFINITIONS}}",
    definitions,
  ).replace("{{BUCKET_NAMES}}", names);
}

/** Shape sent to the model per email (subject/sender/snippet, plus the id). */
export interface BatchEmail {
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
}

export function toBatchInput(threads: Thread[]): BatchEmail[] {
  return threads.map((t) => ({
    threadId: t.id,
    from: t.from,
    subject: t.subject,
    snippet: t.snippet,
  }));
}

// Few-shot anchor for the hard boundary cases (newsletter vs promotion, etc.).
// Sent as a prior user/model turn before the real batch.
export const FEW_SHOT_INPUT: BatchEmail[] = [
  {
    threadId: "t1",
    from: "Sarah Chen <sarah@acmecorp.com>",
    subject: "Re: Q3 deck — can you review before Thursday?",
    snippet:
      "Hey, pushed the latest version. Need your eyes on slides 8-12 before the client call.",
  },
  {
    threadId: "t2",
    from: "The Verge <newsletter@theverge.com>",
    subject: "Your Daily Verge: 10 stories to start your morning",
    snippet: "The biggest tech news today, plus a review of the new...",
  },
  {
    threadId: "t3",
    from: "Nike <no-reply@notifications.nike.com>",
    subject: "🔥 24 HOURS ONLY: 40% off everything",
    snippet: "Your exclusive early access ends tonight. Shop now before it's gone.",
  },
  {
    threadId: "t4",
    from: "Amazon <auto-confirm@amazon.com>",
    subject: "Your order has shipped",
    snippet: "Arriving Tuesday. Track your package for order #114-...",
  },
  {
    threadId: "t5",
    from: "LinkedIn <notifications@linkedin.com>",
    subject: "You appeared in 9 searches this week",
    snippet: "See who's been looking at your profile and grow your network.",
  },
];

export const FEW_SHOT_OUTPUT = [
  {
    threadId: "t1",
    bucket: "Important",
    confidence: 0.95,
    reason: "Colleague needs a review before a deadline",
  },
  {
    threadId: "t2",
    bucket: "Newsletter",
    confidence: 0.97,
    reason: "Subscribed daily news digest",
  },
  {
    threadId: "t3",
    bucket: "Promotions",
    confidence: 0.96,
    reason: "Time-limited discount marketing from a brand",
  },
  {
    threadId: "t4",
    bucket: "Auto-archive",
    confidence: 0.9,
    reason: "Automated shipping notification, no action needed",
  },
  {
    threadId: "t5",
    bucket: "Auto-archive",
    confidence: 0.82,
    reason: "Low-value automated social notification",
  },
];
