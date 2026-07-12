import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camo Clash — AESTRAWEAR",
  description: "Own the block in AESTRAWEAR's endless street-fight survival game.",
  icons: {
    icon: "/pants/pants4.webp",
    shortcut: "/pants/pants4.webp",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
