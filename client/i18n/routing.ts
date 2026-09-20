import { defineRouting } from "next-intl/routing";
export const routing = defineRouting({ locales: ["en", "es", "vi", "zh"], defaultLocale: "en",
  // dev-note: no Accept-Language / cookie sniffing — / is always English, the parent picks a language
  localeDetection: false,
});
