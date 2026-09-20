import { FileCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import AuthButton from "./auth-button";

export default function SiteHeader({ locale }: { locale: string }) {
  const t = useTranslations("nav");
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
      <a href={`/${locale}`} className="flex items-center gap-2 text-sm font-semibold text-brand">
        <FileCheck size={20} /> Paper Bridge
      </a>
      <nav className="flex items-center gap-4 text-sm">
        <a href={`/${locale}/about`} className="text-muted hover:text-ink">{t("about")}</a>
        <AuthButton />
      </nav>
    </header>
  );
}
