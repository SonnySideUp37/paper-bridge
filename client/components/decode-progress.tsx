"use client";
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

// dev-note: /decode is one sync request, so this is elapsed-time theatre: ~8s per page then
// "merge", capped at 95% until the real response arrives. Swap for real events if we ever stream.
const PER_STEP = 8;

export default function DecodeProgress({ n }: { n: number }) {
  const t = useTranslations("upload");
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 0.25), 250);
    return () => clearInterval(id);
  }, []);
  const steps = [
    ...Array.from({ length: n }, (_, i) => t("stepPage", { n: i + 1 })),
    t("stepMerge"),
  ];
  const current = Math.min(Math.floor(elapsed / PER_STEP), steps.length - 1);
  const pct = Math.min(95, (elapsed / (PER_STEP * steps.length)) * 100);
  return (
    <div className="space-y-4 rounded-[20px] border border-line bg-surface p-5 text-left">
      <ul className="space-y-3">
        {steps.map((label, i) => (
          <li
            key={i}
            className={`flex items-center gap-3 ${i > current ? "text-muted" : ""}`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full ${
                i < current
                  ? "bg-brand text-white"
                  : i === current
                    ? "bg-brand-soft text-brand"
                    : "border border-line"
              }`}
            >
              {i < current && <Check size={14} />}
              {i === current && <Loader2 size={14} className="animate-spin" />}
            </span>
            {label}
          </li>
        ))}
      </ul>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
