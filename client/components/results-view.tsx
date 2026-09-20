"use client";
import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, CalendarPlus, Link as LinkIcon } from "lucide-react";
import {
  icsUrl,
  urgencyOf,
  type ActionItem,
  type DecodeResult,
  type Urgency,
} from "@/lib/api";
import ItemCard from "./item-card";
import ReplyDrawer from "./reply-drawer";
import AuthButton from "./auth-button";

const GROUPS: { key: Urgency; label: string; dot: string }[] = [
  { key: "overdue", label: "groupOverdue", dot: "bg-danger" },
  { key: "this_week", label: "groupThisWeek", dot: "bg-danger" },
  { key: "later", label: "groupLater", dot: "bg-warn" },
  { key: "none", label: "groupInfo", dot: "bg-muted" },
];

export default function ResultsView({
  id,
  initial,
}: {
  id: string | null;
  initial: DecodeResult | null;
}) {
  const t = useTranslations("results");
  const locale = useLocale();
  const [reply, setReply] = useState<ActionItem | null>(null);
  const [copied, setCopied] = useState(false);
  // dev-note: /r/local fallback when KV write failed; server snapshot is null so SSR and hydration agree
  const local = useSyncExternalStore(
    () => () => {},
    () => sessionStorage.getItem("pb:last"),
    () => null,
  );
  const result: DecodeResult | null =
    initial ?? (local ? JSON.parse(local) : null);
  if (!result) return null;

  const items = result.items.map((i) => ({
    ...i,
    urgency: urgencyOf(i.due_date),
  }));
  const thisWeek = items.filter(
    (i) => i.urgency === "overdue" || i.urgency === "this_week",
  ).length;
  const owed = items.reduce((s, i) => s + (i.amount_usd ?? 0), 0);
  const toSign = items.filter((i) => i.needs_signature).length;
  const dated = items.filter((i) => i.due_date).length;
  const failed = result.pages.filter((p) => p.failed);
  const stats: [string | number, string, string][] = [
    [thisWeek, t("thisWeek"), "text-danger"],
    [`$${owed}`, t("owed"), "text-warn"],
    [toSign, t("toSign"), "text-brand"],
  ];

  return (
    <main className="mx-auto max-w-md pb-28 md:max-w-3xl">
      <div className="space-y-6 px-5 pt-6">
        <div className="flex items-center justify-between">
          <a
            href={`/${locale}`}
            className="flex items-center gap-1.5 font-medium text-brand"
          >
            <ArrowLeft size={18} />
            {t("newStack")}
          </a>
          <div className="flex items-center gap-3">
            <AuthButton />
            {id && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(location.href);
                  setCopied(true);
                }}
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-sm font-semibold"
              >
                <LinkIcon size={15} />
                {copied ? t("copied") : t("share")}
              </button>
            )}
          </div>
        </div>

        <header className="space-y-1">
          <h1 className="font-serif text-[34px] font-semibold leading-tight">
            {t("title", { n: items.length })}
          </h1>
          <p className="text-sm text-muted">
            {t("from", { n: result.pages.length })}
          </p>
        </header>

        <div className="grid grid-cols-3 gap-2">
          {stats.map(([v, l, c]) => (
            <div
              key={l}
              className="rounded-2xl border border-line bg-surface px-3.5 py-3"
            >
              <div className={`font-serif text-2xl font-semibold ${c}`}>
                {v}
              </div>
              <div className="text-xs text-muted">{l}</div>
            </div>
          ))}
        </div>

        {GROUPS.map((g) => {
          const list = items.filter((i) => i.urgency === g.key);
          if (!list.length) return null;
          return (
            <section key={g.key} className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted">
                <span className={`size-2 rounded-full ${g.dot}`} />
                {t(g.label)}
              </div>
              <div className="grid gap-2.5 md:grid-cols-2">
                {list.map((i) => (
                  <ItemCard
                    key={i.id}
                    item={i}
                    onReply={
                      result.reply_drafts.some((d) => d.item_id === i.id)
                        ? () => setReply(i)
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}

        {failed.map((p) => (
          <p key={p.index} className="text-sm text-danger">
            {t("pageFailed", { n: p.index + 1 })}
          </p>
        ))}
      </div>

      {id && dated > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface px-5 pb-7 pt-3">
          <a
            href={icsUrl(id)}
            download
            className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl bg-brand py-4 font-semibold text-white"
          >
            <CalendarPlus size={18} />
            {t("addToCalendar", { n: dated })}
          </a>
        </div>
      )}

      <ReplyDrawer
        item={reply}
        draft={result.reply_drafts.find((d) => d.item_id === reply?.id) ?? null}
        onClose={() => setReply(null)}
      />
    </main>
  );
}
