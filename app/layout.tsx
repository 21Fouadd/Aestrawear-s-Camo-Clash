import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://camo-clash-aestrawear.aestrawear-camo-clash.workers.dev"),
  title: "Camo Clash — AESTRAWEAR",
  description: "Own the block in AESTRAWEAR's endless street-fight survival game.",
  icons: {
    icon: "/pants/pants4.webp",
    shortcut: "/pants/pants4.webp",
  },
  openGraph: {
    title: "Camo Clash — AESTRAWEAR",
    description: "Fight the infected streets solo or as a two-player squad.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Two Camo Clash fighters facing a zombie wave" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Camo Clash — AESTRAWEAR",
    description: "Fight the infected streets solo or as a two-player squad.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070a10",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
