import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./chrome.css";

const displayFont = localFont({ src: "../../public/fonts/Audiowide-Regular.ttf", variable: "--font-display", weight: "400", display: "swap" });
const interfaceFont = localFont({ src: "../../public/fonts/Rajdhani-SemiBold.ttf", variable: "--font-interface", weight: "600", display: "swap" });

export const metadata: Metadata = {
  title: "Who's free, gdmit",
  description: "Find the hour that works for your whole crew.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${displayFont.variable} ${interfaceFont.variable}`}><body>
    <div className="holographic-backdrop" aria-hidden="true"><div className="holographic-light" /><div className="holographic-grain" /></div>
    {children}
  </body></html>;
}
