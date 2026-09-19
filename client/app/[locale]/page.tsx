import { useTranslations } from "next-intl";

// dev-note: placeholder until Task 8 replaces it with <UploadForm/>
export default function Page() {
  const t = useTranslations("upload");
  return (
    <main className="mx-auto max-w-md px-5 pt-10 space-y-3">
      <h1 className="font-serif text-[34px] leading-tight font-semibold">{t("title")}</h1>
      <p className="text-muted">{t("subtitle")}</p>
      <span className="inline-block rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">tokens ok</span>
    </main>
  );
}
