import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://camo-clash-aestrawear.aestrawear-camo-clash.workers.dev";
const SOCIAL_IMAGE_URL = `${SITE_URL}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Camo Clash — AESTRAWEAR",
  description: "Own the block in AESTRAWEAR's endless street-fight survival game.",
  icons: {
    icon: "/pants/pants4.webp",
    shortcut: "/pants/pants4.webp",
  },
  openGraph: {
    url: SITE_URL,
    title: "Camo Clash — AESTRAWEAR",
    description: "Fight the infected streets solo or as a two-player squad.",
    type: "website",
    images: [{ url: SOCIAL_IMAGE_URL, width: 1200, height: 630, alt: "Two Camo Clash fighters facing a zombie wave" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Camo Clash — AESTRAWEAR",
    description: "Fight the infected streets solo or as a two-player squad.",
    images: [SOCIAL_IMAGE_URL],
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
