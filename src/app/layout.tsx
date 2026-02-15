import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Vendor Compliance Dashboard (UAE)",
  description: "Minimal dashboard for vendor applications and compliance workflows."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
