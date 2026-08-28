import { Suspense } from "react";

export default function DesktopAuthLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="min-h-screen bg-[#0b0b0b]" />}>{children}</Suspense>;
}
