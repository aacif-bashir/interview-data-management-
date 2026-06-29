import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Data Mng — Coding Interview Knowledge Base",
  description:
    "A file-explorer style knowledge base for organizing and studying coding interview questions and answers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head suppressHydrationWarning>
        {/* Geist fonts via Google Fonts — replaces next/font (incompatible with Babel) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --font-sans: 'Geist', sans-serif;
            --font-geist-mono: 'Geist Mono', monospace;
          }
        `}</style>
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
