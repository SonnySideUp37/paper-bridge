import Image from "next/image";
import { Calendar, CalendarPlus, Camera, Clock3, DollarSign, ImageOff, ListChecks, Mail, PenLine, School, UserX } from "lucide-react";
import SiteHeader from "@/components/site-header";

// dev-note: English-only marketing page for judges / first visit; the app itself is localized
const STEPS = [
  [Camera, "1 · Photograph", "Snap every page your kid brought home — flyers, forms, newsletters, up to 8 at once. Blurry is fine."],
  [ListChecks, "2 · We extract what matters", "Only the sentences that ask you to do something: a due date, a fee, a signature, an RSVP. Everything else is dropped."],
  [CalendarPlus, "3 · It lands on your calendar", "Tap once to add every date to your phone. Payments and signatures get a reminder two days early."],
] as const;
const KINDS = [
  [Calendar, "Deadlines", "Permission slips, registration windows, picture day.", "bg-danger-soft text-danger"],
  [DollarSign, "Money", "Field trip fees, yearbook orders, lunch balances — and free-lunch enrollment that saves you money.", "bg-warn-soft text-warn"],
  [PenLine, "Signatures", "Anything that needs your name on it before it goes back in the backpack.", "bg-brand-soft text-brand"],
  [Mail, "Replies", "Conference sign-ups and RSVPs — with a polite English email already drafted for you.", "bg-brand-soft text-brand"],
] as const;
const TRUST = [
  [ImageOff, "Photos are processed and discarded. We never store them."],
  [Clock3, "Results live for 30 days at a private link, then disappear."],
  [UserX, "No account required to decode a stack."],
  [School, "Tested against real newsletters from public school districts."],
] as const;

export default async function About({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const cta = (
    <a href={`/${locale}`} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold text-white">
      <Camera size={18} /> Decode a stack — free
    </a>
  );
  return (
    <>
      <SiteHeader locale={locale} />
      <main className="mx-auto max-w-5xl space-y-24 px-5 pb-24 pt-10">
        <section className="grid items-center gap-10 md:grid-cols-2">
          <div className="space-y-5">
            <span className="inline-block rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">Español · Tiếng Việt · 中文</span>
            <h1 className="font-serif text-5xl leading-[1.05] md:text-6xl">The school sent home 12 pages. Only 4 sentences mattered.</h1>
            <p className="text-lg text-muted">Paper Bridge reads the stack your kid brought home, pulls out what&apos;s due, what costs money, and what needs a signature — in your language — and drops the dates straight onto your phone calendar.</p>
            <div className="flex flex-wrap gap-3">
              {cta}
              <a href={`/${locale}/sample`} className="rounded-xl border border-line bg-surface px-5 py-3 font-semibold">See a sample result</a>
            </div>
            <p className="text-sm text-muted">No account needed. Photos are never stored.</p>
          </div>
          <div className="overflow-hidden rounded-3xl bg-brand-soft px-6 pt-6">
            <Image src="/sample-results.png" alt="Sample result: 4 things to do" width={390} height={844} priority className="mx-auto max-h-[440px] w-auto rounded-t-3xl object-cover object-top shadow-lg" />
          </div>
        </section>

        <section className="space-y-6">
          <p className="text-xs font-semibold tracking-wide text-brand">HOW IT WORKS</p>
          <h2 className="font-serif text-4xl">Three steps. About twenty seconds.</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map(([Icon, title, body]) => (
              <div key={title} className="space-y-3 rounded-2xl border border-line bg-surface p-6">
                <span className="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand"><Icon size={20} /></span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-sm text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <p className="text-xs font-semibold tracking-wide text-brand">WHAT WE LOOK FOR</p>
          <h2 className="font-serif text-4xl">Four kinds of things. Nothing else.</h2>
          <p className="max-w-2xl text-muted">Whole-document translators give you twelve pages in Spanish. We give you the four lines that would have cost you something if you missed them.</p>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {KINDS.map(([Icon, title, body, tone]) => (
              <div key={title} className={`space-y-2 rounded-2xl p-5 ${tone}`}>
                <Icon size={20} />
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-ink/80">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-20 md:grid-cols-2">
          <div className="space-y-4">
            <p className="text-xs font-semibold tracking-wide text-brand-soft">WHY YOU CAN TRUST IT</p>
            <h2 className="font-serif text-4xl">Every item shows the exact English sentence it came from.</h2>
            <p className="text-white/70">So a bilingual cousin, an older sibling, or the teacher can check it in one glance. We would rather show our work than ask you to trust a black box.</p>
          </div>
          <ul className="space-y-5 self-center">
            {TRUST.map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10"><Icon size={18} /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-5xl space-y-5 px-5 py-24 text-center">
        <h2 className="font-serif text-4xl">Try it on tonight&apos;s backpack.</h2>
        <p className="text-muted">Free during SASEhack 2026. No sign-up, no app to install.</p>
        {cta}
      </section>
      <footer className="border-t border-line px-5 py-6 text-center text-xs text-muted">© 2026 Paper Bridge · Built at SASEhack</footer>
    </>
  );
}
