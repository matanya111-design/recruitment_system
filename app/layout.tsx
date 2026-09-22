import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "מערכת לניהול והערכת מועמדים",
  description: "מערכת פנימית לניהול תהליכי גיוס טכנולוגיים",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
