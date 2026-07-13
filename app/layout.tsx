import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camo Clash — AESTRAWEAR",
  description: "Own the block in AESTRAWEAR's endless street-fight survival game.",
  icons: {
    icon: "/pants/pants4.webp",
    shortcut: "/pants/pants4.webp",
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
