export type Lang = "en" | "es" | "vi" | "zh";
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

// dev-note: tolerate a trailing slash in the env var (…railway.app/ + /decode would 404)
const API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

export async function decode(files: File[], lang: Lang): Promise<{ id: string | null; result: DecodeResult }> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("target_language", lang);
  const r = await fetch(`${API}/decode`, { method: "POST", body: fd });
  if (!r.ok) {
    // dev-note: 4xx from our routes is a string; 422 validation and proxy errors aren't
    const d = await r.json().then((j) => j.detail).catch(() => null);
    throw new Error(typeof d === "string" ? d : r.statusText);
  }
  return r.json();
}

export async function getResult(id: string): Promise<DecodeResult | null> {
  const r = await fetch(`${API}/r/${id}`, { cache: "no-store" });
  return r.ok ? r.json() : null;
}

export const icsUrl = (id: string) => `${API}/r/${id}/calendar.ics`;

// dev-note: mirrors server compute_urgency but against *now*, so an old share link regroups correctly
export function urgencyOf(due: string | null, today = new Date()): Urgency {
  if (!due) return "none";
  const d = new Date(`${due}T00:00`);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((d.getTime() - t0.getTime()) / 86400000);
  if (days < 0) return "overdue";
  if (days <= 7) return "this_week";
  return "later";
}
