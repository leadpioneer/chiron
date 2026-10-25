import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { BottomNav } from "@/src/components/BottomNav";
import { ServiceWorker } from "@/src/components/ServiceWorker";
import { SubjectBar } from "@/src/components/SubjectBar";
import { TelegramBoot } from "@/src/components/TelegramBoot";
import { TopNav } from "@/src/components/TopNav";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Chiron — адаптивный дневник силы",
    template: "%s · Chiron",
  },
  description:
    "Адаптивный дневник силовых тренировок: план, факт, прогрессия и объяснимые решения.",
  applicationName: "Chiron",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
  },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chiron",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0e0d",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <TopNav />
        <SubjectBar />
        <main className="shell">{children}</main>
        <BottomNav />
        <ServiceWorker />
        <TelegramBoot />
      </body>
    </html>
  );
}
