import type { Metadata } from "next";
import { Inter, Radley, Pixelify_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./canary.css";
import { Providers } from "./providers";

const sans = Inter({
  subsets: ["latin"],
  variable: "--sans-stack",
  display: "swap",
});

const radley = Radley({
  subsets: ["latin"],
  variable: "--font-radley",
  display: "swap",
  weight: ["400"],
  style: ["normal", "italic"],
});

const pixelify = Pixelify_Sans({
  subsets: ["latin"],
  variable: "--font-pixelify",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

// No `icons` entry: `app/icon.png` is a Next.js Icon Route; declaring a
// competing icon here would let the browser pick a stale candidate.
export const metadata: Metadata = {
  title: "canary — onchain depeg & exploit markets",
  description:
    "Binary prediction markets for stablecoin depegs and protocol exploits, settled on Arc. Buy parametric cover (simple) or trade YES/NO (expert).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${radley.variable} ${pixelify.variable} ${mono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[100]"
          style={{ background: "url(/noise.png)", opacity: 0.012 }}
        />
      </body>
    </html>
  );
}
