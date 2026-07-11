export interface Thread {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export interface Classification {
  threadId: string;
  bucket: string;
  confidence: number;
  reason: string;
}
