import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SupabaseBrowserEnv } from "@/components/auth/supabase-browser-env";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@g-aid/branding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: PRODUCT_DESCRIPTION,
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icon.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-white">
        <SupabaseBrowserEnv
          url={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
          anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
        >
          <ThemeProvider>{children}</ThemeProvider>
        </SupabaseBrowserEnv>
      </body>
    </html>
  );
}
