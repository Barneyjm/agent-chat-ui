import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";

const inter = Inter({
  subsets: ["latin"],
  preload: true,
  display: "swap",
});

export const metadata: Metadata = {
  title: "North Pole Quest",
  description: "An interactive Christmas adventure game - explore magical regions, roll dice, draw cards, and find all 6 Magic Gifts to save Christmas!",
  openGraph: {
    title: "North Pole Quest",
    description: "An interactive Christmas adventure game - explore magical regions, roll dice, draw cards, and find all 6 Magic Gifts to save Christmas!",
    images: [
      {
        url: "/welcome.webp",
        width: 1200,
        height: 630,
        alt: "North Pole Quest - A Christmas Adventure",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "North Pole Quest",
    description: "An interactive Christmas adventure game - find all 6 Magic Gifts to save Christmas!",
    images: ["/welcome.webp"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
