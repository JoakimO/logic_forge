import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logic Quest Kids",
  description: "Fun logic adventures for young thinkers."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
