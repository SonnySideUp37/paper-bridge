"use client";
import { Globe } from "lucide-react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { routing } from "@/i18n/routing";

const LABEL: Record<string, string> = {
  en: "English",
  es: "Español",
  vi: "Tiếng Việt",
  zh: "中文",
};

// dev-note: native <select>; swaps the locale segment so /vi/r/abc → /es/r/abc keeps the page
export default function LangSwitch() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex cursor-pointer items-center gap-1 text-muted hover:text-ink">
      <Globe size={16} />
      <select
        value={locale}
        onChange={(e) =>
          router.push(pathname.replace(`/${locale}`, `/${e.target.value}`))
        }
        className="cursor-pointer appearance-none bg-transparent pr-1 text-sm font-medium text-inherit outline-none"
        aria-label="Language"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
