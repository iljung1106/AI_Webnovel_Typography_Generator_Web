import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Webnovel Typography Forge",
  description: "AI-assisted Korean webnovel title typography creation."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
