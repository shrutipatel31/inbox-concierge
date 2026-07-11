# Inbox Concierge — Classification Prompt

The prompt + schema for the Gemini classifier. Built to be **templated**: the bucket set is injected at runtime so the same prompt works for default buckets and any custom buckets the user adds.

---

## Design notes (say these in the video)

- **Buckets are injected, not hardcoded** → one prompt handles default + custom buckets. Adding a bucket just changes the injected block and the enum.
- **Enum-constrained output** → the model can only return a valid bucket name. No post-hoc validation of made-up categories.
- **Confidence + reason per email** → drives the escalation logic *and* the "why here?" UI. One schema, two payoffs.
- **Batched input** → many emails per call. The instructions + bucket defs + examples are the cacheable constant; only the email list varies.
- **Explicit tie-breakers** → most classification errors are boundary cases (newsletter vs promotion, important vs can-wait). The rules section handles them so the model isn't guessing.

---

## System prompt

Template variables: `{{BUCKET_DEFINITIONS}}` and `{{BUCKET_NAMES}}` are built from the current bucket set at runtime.

```
You are an email triage assistant. You classify emails into exactly one bucket each,
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
No prose, no markdown, no code fences — JSON only.
```

---

## Default bucket definitions

This is what fills `{{BUCKET_DEFINITIONS}}` for the default set. Each custom bucket the user adds appends one more line in the same shape (`- **Name**: description`).

```
- **Important**: Needs your attention or a decision soon. Real people expecting a reply,
  time-sensitive work, account/security issues, anything with real personal or work stakes.
- **Can Wait**: Legitimate and relevant, but no urgency. FYIs, low-priority threads,
  things you'd get to eventually without consequence.
- **Newsletter**: Content you subscribed to — digests, updates, publications, blogs.
  Informational, recurring, not trying to sell you something specific right now.
- **Promotions**: Marketing and sales — discounts, offers, product pushes, promo codes,
  "last chance" deals from brands.
- **Auto-archive**: Low-value automated noise — receipts, delivery/shipping notifications,
  calendar acks, social/app notifications, no-reply system mail you rarely need to see.
```

**Disambiguation baked into the descriptions** (the common confusions):
- *Newsletter vs Promotions* → subscribed content vs a brand selling you something.
- *Important vs Can Wait* → does it need action/decision soon, or not.
- *Auto-archive vs Promotions* → machine noise (receipts, notifications) vs marketing from a person/brand.

---

## Few-shot examples

Put these in the prompt (or as prior turns) before the real batch. They anchor the hard cases.

**Example input:**
```json
[
  { "threadId": "t1", "from": "Sarah Chen <sarah@acmecorp.com>", "subject": "Re: Q3 deck — can you review before Thursday?", "snippet": "Hey, pushed the latest version. Need your eyes on slides 8-12 before the client call." },
  { "threadId": "t2", "from": "The Verge <newsletter@theverge.com>", "subject": "Your Daily Verge: 10 stories to start your morning", "snippet": "The biggest tech news today, plus a review of the new..." },
  { "threadId": "t3", "from": "Nike <no-reply@notifications.nike.com>", "subject": "🔥 24 HOURS ONLY: 40% off everything", "snippet": "Your exclusive early access ends tonight. Shop now before it's gone." },
  { "threadId": "t4", "from": "Amazon <auto-confirm@amazon.com>", "subject": "Your order has shipped", "snippet": "Arriving Tuesday. Track your package for order #114-..." },
  { "threadId": "t5", "from": "LinkedIn <notifications@linkedin.com>", "subject": "You appeared in 9 searches this week", "snippet": "See who's been looking at your profile and grow your network." }
]
```

**Example output:**
```json
[
  { "threadId": "t1", "bucket": "Important", "confidence": 0.95, "reason": "Colleague needs a review before a deadline" },
  { "threadId": "t2", "bucket": "Newsletter", "confidence": 0.97, "reason": "Subscribed daily news digest" },
  { "threadId": "t3", "bucket": "Promotions", "confidence": 0.96, "reason": "Time-limited discount marketing from a brand" },
  { "threadId": "t4", "bucket": "Auto-archive", "confidence": 0.9, "reason": "Automated shipping notification, no action needed" },
  { "threadId": "t5", "bucket": "Auto-archive", "confidence": 0.82, "reason": "Low-value automated social notification" }
]
```

Note the deliberate near-miss: `t5` could be Promotions, so confidence is a bit lower — that models honest calibration for the escalation step.

---

## Batch input format

Send each batch as a JSON array of `{ threadId, from, subject, snippet }`. Keep it to ~15–25 per call. Prepend the system prompt (cached) + few-shot, then:

```
Classify these emails:
<JSON array of the batch>
```

---

## Gemini response schema (structured output)

Build the `enum` from the current bucket set at runtime so custom buckets are included.

```js
// bucketNames = ["Important", "Can Wait", "Newsletter", "Promotions", "Auto-archive", ...custom]

const responseSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      threadId:   { type: "string" },
      bucket:     { type: "string", enum: bucketNames },
      confidence: { type: "number" },
      reason:     { type: "string" },
    },
    required: ["threadId", "bucket", "confidence", "reason"],
    propertyOrdering: ["threadId", "bucket", "confidence", "reason"],
  },
};

// In the generateContent call:
config: {
  responseMimeType: "application/json",
  responseSchema,
  temperature: 0,          // deterministic classification
}
```

`temperature: 0` keeps classification stable and repeatable — important so the same inbox classifies the same way across runs, and easy to point to as a deliberate choice.

---

## Confidence-based escalation

After a first pass on Flash-Lite:

1. Collect threads with `confidence < 0.6`.
2. Re-classify just those — either a second pass with a tighter prompt / more of the email body, or (production framing) route them to a stronger model.
3. Keep the higher-confidence result.

Typically only a handful of the 200 escalate, so the cost stays near zero while accuracy on the ambiguous tail improves. This is the routing story: **cheap by default, escalate on ambiguity.**

---

## Handling custom buckets

When a user adds a bucket:
1. Append `- **<Name>**: <description>` to `{{BUCKET_DEFINITIONS}}`.
2. Add `<Name>` to `{{BUCKET_NAMES}}` and to the schema `enum`.
3. Re-run the pipeline over the cached threads with the updated prompt + schema.

If the user gives only a name, generate a one-line description from it with a quick LLM call first — a cheap way to keep classifications accurate (and a small wow-factor: natural-language bucket creation).

**Edge case:** more buckets = more overlap. The "prefer most specific / lower confidence when torn" rules already handle this, and the escalation pass catches the genuine ambiguities the new bucket introduces.
