import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
export default getRequestConfig(async ({ requestLocale }) => {
  const l = await requestLocale;
  const locale = routing.locales.includes(l as never) ? l! : routing.defaultLocale;
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
