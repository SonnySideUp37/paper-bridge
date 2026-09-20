"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus, Sparkles } from "lucide-react";
import { decode, type Lang } from "@/lib/api";
import { downscale } from "@/lib/image";
import { saveToHistory } from "@/lib/firebase";
import SiteHeader from "./site-header";
import DecodeProgress from "./decode-progress";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "zh", label: "中文" },
];
const MAX = 8;

export default function UploadForm() {
  const t = useTranslations("upload");
  const locale = useLocale();
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const lang = locale as Lang;

  const previews = useMemo(
    () =>
      files.map((f) =>
        f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
      ),
    [files],
  );
  useEffect(
    () => () => previews.forEach((u) => u && URL.revokeObjectURL(u)),
    [previews],
  );

  function pick(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    setErr(next.length > MAX ? t("errorTooMany") : "");
    setFiles(next.slice(0, MAX));
  }

  async function go() {
    setBusy(true);
    setErr("");
    try {
      const prepped = await Promise.all(files.map((f) => downscale(f)));
      const { id, result } = await decode(prepped, lang);
      if (id) saveToHistory(result).catch(() => {});
      if (id) router.push(`/${locale}/r/${id}`);
      else {
        sessionStorage.setItem("pb:last", JSON.stringify(result));
        router.push(`/${locale}/r/local`);
      }
    } catch (e) {
      setErr((e as Error).message || t("errorAllFailed"));
      setBusy(false);
    }
  }

  const n = files.length;
  return (
    <>
      <SiteHeader locale={locale} />
      <main className="mx-auto max-w-md space-y-7 px-5 pb-8 pt-6 md:max-w-xl md:pt-14 md:text-center">
        <div className="space-y-7">
          <header className="space-y-2">
            <h1 className="font-serif text-[34px] font-semibold leading-tight md:text-5xl">
              {busy ? t("decoding", { n }) : t("title")}
            </h1>
            <p className="text-muted">
              {busy ? t("decodingHint") : t("subtitle")}
            </p>
          </header>

          {!busy && (
            <section className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-muted">
                {t("language")}
              </p>
              <div className="grid grid-cols-2 gap-2 md:flex md:justify-center">
                {LANGS.map((l) => (
                  <a
                    key={l.code}
                    href={`/${l.code}`}
                    className={`flex-1 rounded-full border px-6 py-3 text-center text-[15px] md:flex-none ${
                      l.code === lang
                        ? "border-brand bg-brand font-semibold text-white"
                        : "border-line bg-surface"
                    }`}
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-7">
          {busy && <DecodeProgress n={n} />}

          {!busy && (
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-[20px] border-2 border-brand bg-surface px-5 py-8">
              <span className="grid size-16 place-items-center rounded-full bg-brand-soft text-brand">
                <Camera size={30} />
              </span>
              <span className="text-lg font-semibold">{t("dropTitle")}</span>
              <span className="text-sm text-muted">{t("dropHint")}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                multiple
                hidden
                onChange={(e) => pick(e.target.files)}
              />
            </label>
          )}

          {n > 0 && (
            <section className="space-y-2">
              <div className="flex justify-between text-xs font-semibold tracking-wide text-muted">
                <span>{t("selected", { n })}</span>
                {!busy && (
                  <button className="text-brand" onClick={() => setFiles([])}>
                    {t("clear")}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {files.map((f, i) => (
                  <div
                    key={i}
                    className={`relative h-[110px] overflow-hidden rounded-xl border border-line bg-[#E9E4DA] ${busy ? "animate-pulse" : ""}`}
                  >
                    {previews[i] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previews[i]}
                        alt=""
                        className="size-full object-cover"
                      />
                    )}
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/80 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                  </div>
                ))}
                {!busy && n < MAX && (
                  <label className="grid h-[110px] cursor-pointer place-items-center rounded-xl border border-line text-muted">
                    <Plus size={22} />
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      hidden
                      onChange={(e) => pick(e.target.files)}
                    />
                  </label>
                )}
              </div>
            </section>
          )}

          {err && <p className="text-sm text-danger">{err}</p>}

          <button
            disabled={busy || n === 0}
            onClick={go}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-[18px] text-[17px] font-semibold text-white disabled:bg-line disabled:text-muted"
          >
            {/* dev-note: text in a span so Chrome auto-translate's <font> wrapping can't break React's sibling swap */}
            {busy ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Sparkles size={20} />
            )}
            <span>
              {busy ? t("decoding", { n }) : t("decode", { n: Math.max(n, 1) })}
            </span>
          </button>
          <p className="text-center text-xs text-muted">{t("privacy")}</p>
        </div>
      </main>
    </>
  );
}
