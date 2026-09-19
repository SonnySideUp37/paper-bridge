import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, orderBy, query, setDoc } from "firebase/firestore/lite";
import type { DecodeResult } from "./api";

// dev-note: lazy init so the app runs without Firebase keys — auth UI simply hides
export const firebaseReady = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

function app() {
  return (
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  );
}
export const auth = () => getAuth(app());
export const db = () => getFirestore(app());

export const googleSignIn = () => signInWithPopup(auth(), new GoogleAuthProvider());

export type HistoryRow = {
  id: string;
  title: string;
  itemCount: number;
  targetLanguage: string;
  createdAt: number;
};

// dev-note: title = first item's title; good enough for a list row
export async function saveToHistory(result: DecodeResult) {
  const uid = firebaseReady ? auth().currentUser?.uid : undefined;
  if (!uid) return;
  const row: HistoryRow = {
    id: result.id,
    title: result.items[0]?.title ?? "",
    itemCount: result.items.length,
    targetLanguage: result.target_language,
    createdAt: Date.now(),
  };
  await setDoc(doc(db(), "users", uid, "results", result.id), row);
}

export async function listHistory(uid: string): Promise<HistoryRow[]> {
  const q = query(collection(db(), "users", uid, "results"), orderBy("createdAt", "desc"));
  return (await getDocs(q)).docs.map((d) => d.data() as HistoryRow);
}
