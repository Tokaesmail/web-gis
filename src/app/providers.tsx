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
      <Toaster 
        position="top-center" 
        expand={false} 
        richColors 
        toastOptions={{
          style: {
            background: 'rgba(10, 22, 40, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0, 212, 255, 0.25)',
            color: '#e2e8f0',
            borderRadius: '16px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
          },
        }}
      />
      {children}
    </SessionProvider>
  );
}