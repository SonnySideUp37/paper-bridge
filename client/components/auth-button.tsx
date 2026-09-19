"use client";
import { useSyncExternalStore } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
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
export const useUser = () => useSyncExternalStore(subscribe, () => current, () => undefined);

export default function AuthButton() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const user = useUser();
  if (!firebaseReady || user === undefined) return null;
  if (!user) {
    return (
      <a href={`/${locale}/signin`} className="text-sm font-semibold text-brand">
        {t("signIn")}
      </a>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <a href={`/${locale}/history`} className="text-sm font-semibold text-brand">
        {t("history")}
      </a>
      <button onClick={() => signOut(auth())} title={t("signOut")}>
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photoURL} alt="" className="size-7 rounded-full" />
        ) : (
          <span className="block size-7 rounded-full bg-brand-soft" />
        )}
      </button>
    </div>
  );
}
