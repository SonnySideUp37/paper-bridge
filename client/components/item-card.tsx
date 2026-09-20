"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calendar, ChevronDown, DollarSign, Mail, MapPin, PenLine } from "lucide-react";
import type { ActionItem } from "@/lib/api";

const TONE = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  ok: "bg-brand-soft text-brand",
} as const;

function Chip({ tone, icon, children }: { tone: keyof typeof TONE; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

export default function ItemCard({ item, onReply }: { item: ActionItem; onReply: () => void }) {
  const t = useTranslations("results");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const when = item.due_date
    ? new Intl.DateTimeFormat(locale, {
        weekday: "short",
        month: "numeric",
        day: "numeric",
        ...(item.due_time && { hour: "numeric", minute: "2-digit" }),
      }).format(new Date(`${item.due_date}T${item.due_time ?? "00:00"}`))
    : null;
  const urgent = item.urgency === "overdue" || item.urgency === "this_week";
  const tone = urgent ? "danger" : item.urgency === "later" ? "warn" : "ok";
  const Icon = item.needs_signature ? PenLine : item.amount_usd ? DollarSign : Calendar;

  return (
    <article className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${TONE[tone]}`}>
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold leading-snug">{item.title}</h3>
          <p className="text-[13px] text-muted">{item.title_en}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {item.due_date && (
          <Chip tone={tone} icon={<Calendar size={13} />}>
            {when}
          </Chip>
        )}
        {item.amount_usd != null && (
          <Chip tone="warn" icon={<DollarSign size={13} />}>
            {item.amount_usd}
          </Chip>
        )}
        {item.location && (
          <Chip tone="ok" icon={<MapPin size={13} />}>
            {item.location}
          </Chip>
        )}
        {item.needs_signature && (
          <Chip tone="ok" icon={<PenLine size={13} />}>
            {t("needsSignature")}
          </Chip>
        )}
        {item.needs_reply && (
          <Chip tone="ok" icon={<Mail size={13} />}>
            {t("needsReply")}
          </Chip>
        )}
      </div>

      {open ? (
        <blockquote className="space-y-1 rounded-lg border-l-[3px] border-line bg-bg px-3 py-2.5">
          <p className="text-[13px] italic text-muted">“{item.source_quote}”</p>
          <p className="text-[11px] font-semibold text-muted">{t("page", { n: item.source_page + 1 })}</p>
        </blockquote>
      ) : (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-[13px] font-semibold text-brand">
          {t("showOriginal")}
          <ChevronDown size={14} />
        </button>
      )}

      {item.needs_reply && (
        <button
          onClick={onReply}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-soft py-3 text-sm font-semibold text-brand"
        >
          <Mail size={16} />
          {t("draftReply")}
        </button>
      )}
    </article>
  );
}
