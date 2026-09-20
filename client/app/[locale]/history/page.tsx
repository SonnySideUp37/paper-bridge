"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight } from "lucide-react";
import { useUser } from "@/components/auth-button";
import SiteHeader from "@/components/site-header";
import { firebaseReady, listHistory, type HistoryRow } from "@/lib/firebase";

export default function History() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const user = useUser();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    if (firebaseReady && user === undefined) return;
    if (!user) {
      router.replace(`/${locale}/signin`);
      return;
    }
    listHistory(user.uid).then(setRows);
  }, [user, locale, router]);

  return (
    <>
      <SiteHeader locale={locale} />
      <main className="mx-auto max-w-md space-y-6 px-5 pb-8 pt-6 md:max-w-2xl">
        <header className="space-y-1">
          <h1 className="font-serif text-[34px] font-semibold leading-tight">
            {t("history")}
          </h1>
          {rows?.length === 0 && <p className="text-muted">{t("empty")}</p>}
        </header>
        <ul className="space-y-2.5">
          {rows?.map((r) => (
            <li key={r.id}>
              <a
                href={`/${locale}/r/${r.id}`}
                className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.title}</p>
                  <p className="text-xs text-muted">
                    {new Date(r.createdAt).toLocaleDateString(locale)} ·{" "}
                    {t("items", { n: r.itemCount })}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </a>
            </li>
          ))}
        </ul>
        <a
          href={`/${locale}`}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 font-semibold text-white"
        >
          <Camera size={18} />
          {t("newStack")}
        </a>
      </main>
    </>
  );
}
