import { getTranslations } from "next-intl/server";
import { getResult } from "@/lib/api";
import ResultsView from "@/components/results-view";

export default async function Page({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id } = await params;
  const t = await getTranslations("results");
  if (id === "local") return <ResultsView id={null} initial={null} />;
  const result = await getResult(id);
  if (!result) {
    return <main className="mx-auto max-w-md p-5 pt-20 text-center text-muted">{t("expired")}</main>;
  }
  return <ResultsView id={id} initial={result} />;
}
