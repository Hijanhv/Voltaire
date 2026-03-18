import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Providers from "./providers";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Voltaire — Cross-Chain Options AMM",
  description:
    "European options trading on Uniswap V4. On-chain Black-Scholes pricing powered by Reactive Network cross-chain volatility.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>
        <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
          <Providers>
          <Sidebar />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <TopBar />
            <main style={{ flex: 1, overflowY: "auto", padding: "32px 36px" }}>
              {children}
            </main>
          </div>
        </Providers>
        </div>
      </body>
    </html>
  );
}
