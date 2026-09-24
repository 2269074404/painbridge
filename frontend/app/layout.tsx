import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PainBridge: Chronic Pain Trials & Self-Management",
  description:
    "PainBridge matches people living with chronic pain to clinical trials, forecasts pain from a daily diary, and supports self-management, with an equity-first recruitment workflow for study teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
