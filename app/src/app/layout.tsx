import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { UserMenu } from "@/components/user-menu";
import { SiteTitle, SiteTitleText } from "@/components/site-title";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Public Records Portal", template: "%s · Public Records Portal" },
  description: "Submit and track public records requests.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-white focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
            {/* Both read the session, so they stream in without holding up the page. */}
            <Suspense fallback={<SiteTitleText />}>
              <SiteTitle />
            </Suspense>
            <Suspense fallback={<span className="h-8" aria-hidden />}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        {/*
          Full width here, so the home and login heroes can run edge to edge.
          The signed-in pages get their centered column from (portal)/layout.tsx.
          Don't switch styles here based on what the page contains (e.g. CSS
          :has()): Next.js keeps the previous page in the DOM, hidden, after a
          navigation, so it would still match.
        */}
        <main id="main" className="flex w-full flex-1 flex-col">
          {children}
        </main>
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-muted">
          Not affiliated with any government agency.
        </footer>
      </body>
    </html>
  );
}
