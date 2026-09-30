import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Textile ERP — Fabric Mill", template: "%s · Textile ERP" },
  description:
    "Multi-tenant ERP for Pakistan's fabric mills: roll register, yarn stock ledger, weaving & knitting, LC imports, roll traceability and deterministic Mill Pulse alerts.",
  openGraph: {
    title: "Textile ERP — Fabric Mill module",
    description: "Roll register, yarn ledger, looms, LC imports and traceability for Pakistan's textile SMEs. Live demo, no sign-up.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Font variables live on <html>: the font-family rule is declared on html,
    // so a variable scoped to <body> would be undefined there (→ serif fallback).
    <html lang="en-PK" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
