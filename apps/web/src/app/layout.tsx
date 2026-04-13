import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { ToastProvider } from "@/components/Toast";
import { AssistantProvider } from "@/components/AssistantProvider";
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
        <ToastProvider>
          <NavBar />
          <main className="w-full flex-1">{children}</main>
          <AssistantProvider />
        </ToastProvider>
      </body>
    </html>
  );
}
