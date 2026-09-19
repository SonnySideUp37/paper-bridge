export type Lang = "es" | "vi" | "zh";
export type Urgency = "overdue" | "this_week" | "later" | "none";
export interface ActionItem {
  id: string;
  type: "deadline" | "payment" | "signature" | "event" | "info";
  title: string;
  title_en: string;
  due_date: string | null;
  due_time: string | null;
  location: string | null;
  amount_usd: number | null;
  needs_signature: boolean;
  needs_reply: boolean;
  source_page: number;
  source_quote: string;
  urgency: Urgency;
}
export interface DecodeResult {
  id: string;
  target_language: Lang;
  created_at: string;
  pages: { index: number; summary: string; failed: boolean }[];
  items: ActionItem[];
  reply_drafts: { item_id: string; subject: string; body_en: string }[];
}

const API = process.env.NEXT_PUBLIC_API_URL!;

export async function decode(files: File[], lang: Lang): Promise<{ id: string | null; result: DecodeResult }> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("target_language", lang);
  const r = await fetch(`${API}/decode`, { method: "POST", body: fd });
  if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
  return r.json();
}

export async function getResult(id: string): Promise<DecodeResult | null> {
  const r = await fetch(`${API}/r/${id}`, { cache: "no-store" });
  return r.ok ? r.json() : null;
}

export const icsUrl = (id: string) => `${API}/r/${id}/calendar.ics`;
