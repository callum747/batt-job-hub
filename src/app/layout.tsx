import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "../fonts/Inter-Regular.ttf", weight: "400" },
    { path: "../fonts/Inter-Medium.ttf", weight: "500" },
    { path: "../fonts/Inter-SemiBold.ttf", weight: "600" },
    { path: "../fonts/Inter-Bold.ttf", weight: "700" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const saira = localFont({
  src: [{ path: "../fonts/SairaExpanded-Bold.ttf", weight: "700" }],
  variable: "--font-saira",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Batt Job Hub", template: "%s · Batt Job Hub" },
  description: "Jobs, quotes, visits and invoices for Batt Electrical.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" data-theme="light" className={`${inter.variable} ${saira.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
