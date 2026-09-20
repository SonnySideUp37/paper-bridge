import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Fraunces, Inter } from "next/font/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin", "vietnamese"], weight: "600", variable: "--font-fraunces" });

export const metadata: Metadata = { title: "Paper Bridge" };

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();
  return (
    <html lang={locale} translate="no" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="bg-bg text-ink font-sans antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
