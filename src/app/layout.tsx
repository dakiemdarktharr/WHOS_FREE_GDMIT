import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Who's free, gdmit",
  description: "Find the hour that works for your whole crew.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
