import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/state";
import { BottomNav } from "@/components/BottomNav";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "FitMe",
  description:
    "Training and nutrition in one place, with a coach that reads your actual data.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "FitMe",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  width: "device-width",
  initialScale: 1,
  // The app has its own zoom-free layout; pinch-zoom on a set logger is a
  // misfire, not an intent.
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <div className="mx-auto min-h-screen w-full max-w-2xl">{children}</div>
          <BottomNav />
          <ServiceWorker />
        </AppProvider>
      </body>
    </html>
  );
}
