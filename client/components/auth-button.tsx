"use client";
import { useSyncExternalStore } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { ChevronDown, History, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { auth, firebaseReady } from "@/lib/firebase";

// dev-note: undefined = not yet known (SSR + first paint), null = signed out
let current: User | null | undefined;
const subscribe = (cb: () => void) => {
  if (!firebaseReady) return () => {};
  return onAuthStateChanged(auth(), (u) => {
    current = u;
    cb();
  });
};
export const useUser = () =>
  useSyncExternalStore(
    subscribe,
    () => current,
    () => undefined,
  );

export default function AuthButton() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const user = useUser();
  if (!firebaseReady || user === undefined) return null;
  if (!user) {
    return (
      <a
        href={`/${locale}/signin`}
        className="text-sm font-semibold text-brand"
      >
        {t("signIn")}
      </a>
    );
  }
  const avatar = user.photoURL ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.photoURL} alt="" className="size-7 rounded-full" />
  ) : (
    <span className="block size-7 rounded-full bg-brand-soft" />
  );
  // dev-note: native <details> menu — no Radix dropdown dep; closes on Esc/outside via onBlur below
  return (
    <details
      className="relative"
      onBlur={(e) =>
        !e.currentTarget.contains(e.relatedTarget) &&
        (e.currentTarget.open = false)
      }
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full [&::-webkit-details-marker]:hidden">
        {avatar}
        <ChevronDown size={14} className="text-muted" />
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
        <div className="border-b border-line px-4 py-3">
          <p className="truncate text-sm font-semibold">{user.displayName}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <a
          href={`/${locale}/history`}
          className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-bg"
        >
          <History size={16} className="text-muted" /> {t("history")}
        </a>
        <button
          onClick={() => signOut(auth())}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-danger hover:bg-bg"
        >
          <LogOut size={16} /> {t("signOut")}
        </button>
      </div>
    </details>
  );
}
