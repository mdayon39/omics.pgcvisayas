// app/layout.tsx
import "@/app/globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ReactQueryProvider } from "@/lib/react-query-provider";
import { Toaster } from "@/components/ui/sonner";
import PwaInit from "@/components/pwa/PwaInit";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://omics.pgcvisayas.upv.edu.ph"),
  title: "PGC Visayas Omics Solutions Portal",
  description: "Official PGC Visayas Omics Solutions service request portal.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "https://omics.pgcvisayas.upv.edu.ph/",
    title: "PGC Visayas Omics Solutions Portal",
    description: "Official PGC Visayas Omics Solutions service request portal.",
    siteName: "PGC Visayas Omics Solutions",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-background text-foreground" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <PwaInit />
        <Toaster />
        <ThemeProvider>
          <ReactQueryProvider>{children}</ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
