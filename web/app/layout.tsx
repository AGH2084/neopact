import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./login.css";
import "./connections.css";

const manrope = localFont({
  src: "./fonts/Manrope-Variable.ttf",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
});
const plexMono = localFont({
  src: "./fonts/IBMPlexMono-Regular.ttf",
  variable: "--font-ibm-plex-mono",
  weight: "400",
  display: "swap",
  preload: false,
});
export const metadata: Metadata = {
  title: "neopact — Terms aligned. Business moving.",
  description:
    "Your agents negotiate. Your business decides. A shared workspace for product discovery, commercial terms and human-approved purchasing.",
  icons: {
    icon: [{ url: "/brand/favicon.svg", type: "image/svg+xml" }],
    apple: "/brand/apple-touch-icon.png",
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
