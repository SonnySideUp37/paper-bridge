import { notFound } from "next/navigation";
import ResultsView from "@/components/results-view";
import type { DecodeResult } from "@/lib/api";

// dev-note: static fixture so the results UI can be built without the backend; 404s in production
const FIXTURE: DecodeResult = {
  id: "devfixture",
  target_language: "vi",
  created_at: "2026-09-19T12:00:00Z",
  pages: [
    { index: 0, summary: "Giấy phép đi thực địa", failed: false },
    { index: 1, summary: "Thư PTA", failed: false },
    { index: 2, summary: "", failed: true },
  ],
  items: [
    { id: "i1", type: "signature", title: "Ký giấy phép đi thực địa Sở thú", title_en: "Sign the Zoo field trip permission slip", due_date: "2026-09-26", due_time: null, location: null, amount_usd: 12, needs_signature: true, needs_reply: false, source_page: 0, source_quote: "Permission slips and $12 payment are due Friday, September 26.", urgency: "this_week" },
    { id: "i2", type: "deadline", title: "Đăng ký họp phụ huynh–giáo viên", title_en: "Sign up for parent-teacher conferences", due_date: "2026-09-30", due_time: null, location: null, amount_usd: null, needs_signature: false, needs_reply: true, source_page: 1, source_quote: "Please reply by September 30 to reserve a conference slot.", urgency: "this_week" },
    { id: "i3", type: "payment", title: "Nộp đơn bữa trưa miễn phí/giảm giá", title_en: "Submit free & reduced lunch application", due_date: "2026-10-15", due_time: null, location: null, amount_usd: null, needs_signature: false, needs_reply: false, source_page: 1, source_quote: "Applications for free and reduced-price meals are due October 15.", urgency: "later" },
    { id: "i4", type: "event", title: "Hội chợ mùa thu PTA", title_en: "PTA Fall Festival", due_date: "2026-10-18", due_time: "16:00", location: "Sân trường", amount_usd: 15, needs_signature: false, needs_reply: false, source_page: 1, source_quote: "Join us for the Fall Festival on Saturday, October 18 from 4–7pm. $15 per family.", urgency: "later" },
  ],
  reply_drafts: [
    { item_id: "i2", subject: "Conference sign-up — Minh Nguyen, Rm 12", body_en: "Hello Ms. Rivera,\n\nI would like to sign up for a parent-teacher conference for my child, Minh Nguyen (Room 12). I am available Tuesday or Thursday after 4:00 pm. A Vietnamese interpreter would be very helpful if one is available.\n\nThank you,\nLan Nguyen" },
  ],
};

export default function DevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ResultsView id="devfixture" initial={FIXTURE} />;
}
