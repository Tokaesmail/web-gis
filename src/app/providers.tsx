"use client";
// src/app/providers.tsx
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import type { ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <Toaster position="top-center" expand={false} richColors />
      {children}
    </SessionProvider>
  );
}