import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { DesktopSessionProvider } from "@/components/shared/desktop-session";
import { APP_ICON_PUBLIC_PATH, FAVICON_PUBLIC_PATH, PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@g-aid/branding";

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
    icon: [{ url: FAVICON_PUBLIC_PATH }, { url: APP_ICON_PUBLIC_PATH }],
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
        <ThemeProvider>
          <DesktopSessionProvider>{children}</DesktopSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
