import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Meal Planner",
  description: "Family meal planning powered by AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <nav className="border-b border-card-border bg-card">
          <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-4">
            <Link href="/" className="text-xl font-bold text-foreground">
              Meal Planner
            </Link>
            <div className="flex gap-6 text-sm font-medium">
              <Link href="/recipes" className="text-muted transition-colors hover:text-foreground">
                Recipes
              </Link>
              <Link href="/plan" className="text-muted transition-colors hover:text-foreground">
                Plan
              </Link>
              <Link href="/history" className="text-muted transition-colors hover:text-foreground">
                History
              </Link>
              <Link href="/pantry" className="text-muted transition-colors hover:text-foreground">
                Pantry
              </Link>
            </div>
          </div>
        </nav>
        <main className="w-full flex-1">{children}</main>
      </body>
    </html>
  );
}
