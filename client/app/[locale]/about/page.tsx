import Image from "next/image";
import { getTranslations } from "next-intl/server";
import {
  Calendar,
  CalendarPlus,
  Camera,
  Clock3,
  DollarSign,
  ImageOff,
  ListChecks,
  Mail,
  PenLine,
  School,
  UserX,
} from "lucide-react";
import SiteHeader from "@/components/site-header";

const STEPS = [
  [Camera, "step1"],
  [ListChecks, "step2"],
  [CalendarPlus, "step3"],
] as const;
const KINDS = [
  [Calendar, "kDeadlines", "bg-danger-soft text-danger"],
  [DollarSign, "kMoney", "bg-warn-soft text-warn"],
  [PenLine, "kSign", "bg-brand-soft text-brand"],
  [Mail, "kReply", "bg-brand-soft text-brand"],
] as const;
const TRUST = [
  [ImageOff, "t1"],
  [Clock3, "t2"],
  [UserX, "t3"],
  [School, "t4"],
] as const;

export default async function About({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("about");
  const cta = (
    <a
      href={`/${locale}`}
      className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold text-white"
    >
      <Camera size={18} /> {t("cta")}
    </a>
  );
  return (
    <>
      <SiteHeader locale={locale} />
      <main className="mx-auto max-w-5xl space-y-24 px-5 pb-24 pt-10">
        <section className="grid items-center gap-10 md:grid-cols-2">
          <div className="space-y-5">
            <span className="inline-block rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
              {t("badge")}
            </span>
            <h1 className="font-serif text-5xl leading-[1.05] md:text-6xl">
              {t("heroTitle")}
            </h1>
            <p className="text-lg text-muted">{t("heroBody")}</p>
            <div className="flex flex-wrap gap-3">
              {cta}
              <a
                href={`/${locale}/sample`}
                className="rounded-xl border border-line bg-surface px-5 py-3 font-semibold"
              >
                {t("sample")}
              </a>
            </div>
            <p className="text-sm text-muted">{t("noAccount")}</p>
          </div>
          <div className="overflow-hidden rounded-3xl bg-brand-soft px-6 pt-6">
            <Image
              src="/sample-results.png"
              alt=""
              width={390}
              height={844}
              priority
              className="mx-auto max-h-[440px] w-auto rounded-t-3xl object-cover object-top shadow-lg"
            />
          </div>
        </section>

        <section className="space-y-6">
          <p className="text-xs font-semibold tracking-wide text-brand">
            {t("howLabel")}
          </p>
          <h2 className="font-serif text-4xl">{t("howTitle")}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map(([Icon, k]) => (
              <div
                key={k}
                className="space-y-3 rounded-2xl border border-line bg-surface p-6"
              >
                <span className="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Icon size={20} />
                </span>
                <h3 className="text-lg font-semibold">{t(k)}</h3>
                <p className="text-sm text-muted">{t(`${k}Body`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <p className="text-xs font-semibold tracking-wide text-brand">
            {t("whatLabel")}
          </p>
          <h2 className="font-serif text-4xl">{t("whatTitle")}</h2>
          <p className="max-w-2xl text-muted">{t("whatBody")}</p>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {KINDS.map(([Icon, k, tone]) => (
              <div key={k} className={`space-y-2 rounded-2xl p-5 ${tone}`}>
                <Icon size={20} />
                <h3 className="font-semibold">{t(k)}</h3>
                <p className="text-sm text-ink/80">{t(`${k}Body`)}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-20 md:grid-cols-2">
          <div className="space-y-4">
            <p className="text-xs font-semibold tracking-wide text-brand-soft">
              {t("trustLabel")}
            </p>
            <h2 className="font-serif text-4xl">{t("trustTitle")}</h2>
            <p className="text-white/70">{t("trustBody")}</p>
          </div>
          <ul className="space-y-5 self-center">
            {TRUST.map(([Icon, k]) => (
              <li key={k} className="flex items-center gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10">
                  <Icon size={18} />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-5xl space-y-5 px-5 py-24 text-center">
        <h2 className="font-serif text-4xl">{t("endTitle")}</h2>
        <p className="text-muted">{t("endBody")}</p>
        {cta}
      </section>
      <footer className="border-t border-line px-5 py-6 text-center text-xs text-muted">
        {t("footer")}
      </footer>
    </>
  );
}
