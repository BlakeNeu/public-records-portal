import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { UserMenu } from "@/components/user-menu";
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
            <Link href="/" className="font-semibold tracking-tight">
              Public Records Portal
            </Link>
            {/* Reads the session, so it streams in without holding up the page. */}
            <Suspense fallback={<span className="h-8" aria-hidden />}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        {/* Pages that render a `.full-bleed` section (the home hero) span the full width. */}
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 has-[.full-bleed]:flex has-[.full-bleed]:max-w-none has-[.full-bleed]:flex-col has-[.full-bleed]:p-0"
        >
          {children}
        </main>
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-muted">
          Demo project with fake data. Not affiliated with any government agency.
        </footer>
      </body>
    </html>
  );
}
