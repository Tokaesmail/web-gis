import type { Metadata } from "next";
import { LangProvider } from "./_components/translations";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeoSense AI",
  description: "Intelligent Remote Sensing Analysis Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body>
        <LangProvider>
          {children}
        </LangProvider>
      </body>
    </html>
  );
}