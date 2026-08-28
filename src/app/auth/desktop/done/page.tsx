"use client";

import Image from "next/image";
import Link from "next/link";

export default function DesktopAuthDonePage() {
  return (
    <main className="min-h-screen bg-[#1a1a1a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <Image src="/g-aid logo.png" alt="G-AID" width={88} height={30} className="object-contain mb-10" priority />
        <h1 className="text-3xl font-semibold tracking-tight">All set! Feel free to return to G-AID.</h1>
        <p className="mt-4 text-[#888] text-[17px]">
          This browser window does not send account tokens. If G-AID did not finish signing in, start
          again from the app.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-[#d4d4d4] px-5 text-sm font-semibold text-black hover:bg-white"
        >
          Back to G-AID
        </Link>
      </div>
    </main>
  );
}
