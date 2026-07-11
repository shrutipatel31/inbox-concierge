export interface Bucket {
  name: string;
  description: string;
}

/**
 * Default buckets (spec §5.1). Name + description; the description is injected
 * verbatim into the classifier prompt, so the disambiguation guidance lives
 * here rather than being hardcoded in the prompt template.
 */
export const DEFAULT_BUCKETS: Bucket[] = [
  {
    name: "Important",
    description:
      "Needs your attention or a decision soon. Real people expecting a reply, time-sensitive work, account/security issues, anything with real personal or work stakes.",
  },
  {
    name: "Can Wait",
    description:
      "Legitimate and relevant, but no urgency. FYIs, low-priority threads, things you'd get to eventually without consequence.",
  },
  {
    name: "Newsletter",
    description:
      "Content you subscribed to — digests, updates, publications, blogs. Informational, recurring, not trying to sell you something specific right now.",
  },
  {
    name: "Promotions",
    description:
      'Marketing and sales — discounts, offers, product pushes, promo codes, "last chance" deals from brands.',
  },
  {
    name: "Auto-archive",
    description:
      "Low-value automated noise — receipts, delivery/shipping notifications, calendar acks, social/app notifications, no-reply system mail you rarely need to see.",
  },
];

export function bucketNames(buckets: Bucket[]): string[] {
  return buckets.map((b) => b.name);
}
