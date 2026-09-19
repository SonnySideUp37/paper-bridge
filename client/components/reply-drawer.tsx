"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { ActionItem } from "@/lib/api";

type Draft = { subject: string; body_en: string } | null;

export default function ReplyDrawer({ item, draft, onClose }: { item: ActionItem | null; draft: Draft; onClose: () => void }) {
  const t = useTranslations("results");
  const [body, setBody] = useState<string | null>(null);
  const text = body ?? draft?.body_en ?? "";

  return (
    <Drawer
      open={!!item}
      onOpenChange={(o) => {
        if (!o) {
          setBody(null);
          onClose();
        }
      }}
    >
      <DrawerContent className="bg-surface px-5 pb-8">
        <DrawerTitle className="font-serif text-2xl font-semibold">{t("replyTitle")}</DrawerTitle>
        <p className="text-sm text-muted">{t("replyFor", { title: item?.title ?? "" })}</p>
        <div className="mt-4 space-y-2 rounded-xl border border-line bg-bg p-3.5">
          <p className="text-[13px] font-semibold">
            <span className="text-muted">Subject: </span>
            {draft?.subject}
          </p>
          <hr className="border-line" />
          <textarea
            value={text}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
          />
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(`Subject: ${draft?.subject}\n\n${text}`)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 font-semibold text-white"
        >
          <Copy size={16} />
          {t("copy")}
        </button>
      </DrawerContent>
    </Drawer>
  );
}
