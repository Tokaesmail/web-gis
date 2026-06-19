import type { Metadata } from "next";
import { LangProvider } from "./_components/translations";
import "./globals.css";
import { SessionProvider } from "next-auth/react"
import Providers from "./providers";
import { SpeedInsights } from '@vercel/speed-insights/next';

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
          <Providers>
            {children}
          </Providers>
        </LangProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}