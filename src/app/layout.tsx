import "./globals.css";
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import TheatreBootstrap from "@/components/TheatreBootstrap";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";
import PWARegister from "@/components/PWARegister";

export const metadata: Metadata = {
  title: "AI Danny — your second brain",
  description: "Talk to your Obsidian brain. CEO, COO, CFO, CMO, CRO all query the same vault.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AI Danny",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased bg-background font-sans">
        <TheatreBootstrap />
        <SmoothScrollProvider />
        <PWARegister />
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          toastOptions={{
            classNames: {
              toast:
                "!bg-popover !border-border !text-foreground !shadow-2xl !shadow-black/60 !rounded-lg",
              description: "!text-muted-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}
