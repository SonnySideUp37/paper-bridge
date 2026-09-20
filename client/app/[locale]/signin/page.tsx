"use client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import { firebaseReady, googleSignIn } from "@/lib/firebase";

export default function SignIn() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  return (
    <>
      <SiteHeader locale={locale} />
      <main className="mx-auto max-w-md space-y-7 px-5 pt-10 md:pt-24">
        <header className="space-y-2">
          <h1 className="font-serif text-[34px] font-semibold leading-tight">
            {t("title")}
          </h1>
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
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#EA4335"
              d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z"
            />
            <path
              fill="#FBBC05"
              d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
            />
          </svg>
          <span>{t("google")}</span>
        </button>
        <p className="text-center text-sm text-muted">{t("optional")}</p>
      </main>
    </>
  );
}
