"use client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { FileCheck } from "lucide-react";
import { firebaseReady, googleSignIn } from "@/lib/firebase";

export default function SignIn() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  return (
    <main className="mx-auto max-w-md space-y-7 px-5 pt-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand">
        <FileCheck size={20} /> Paper Bridge
      </div>
      <header className="space-y-2">
        <h1 className="font-serif text-[34px] font-semibold leading-tight">{t("title")}</h1>
        <p className="text-muted">{t("subtitle")}</p>
      </header>
      <button
        disabled={!firebaseReady}
        onClick={async () => {
          await googleSignIn();
          router.push(`/${locale}/history`);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-4 font-semibold disabled:opacity-50"
      >
        {t("google")}
      </button>
      <p className="text-center text-sm text-muted">{t("optional")}</p>
    </main>
  );
}
