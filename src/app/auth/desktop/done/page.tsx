"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { desktopHandoffUrl } from "@/lib/desktop";

export default function DesktopAuthDonePage() {
  const [handoffUrl, setHandoffUrl] = useState("gaid://auth/callback");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setHandoffUrl(
          desktopHandoffUrl(data.session.access_token, data.session.refresh_token)
        );
      }
    });
  }, []);

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <Image src="/g-aid logo.png" alt="G-AID" width={88} height={30} className="object-contain mb-10" priority />
        <h1 className="text-3xl font-semibold tracking-tight">All set! Feel free to return to G-AID.</h1>
        <a
          href={handoffUrl}
          className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-[#d4d4d4] px-5 text-sm font-semibold text-black hover:bg-white"
        >
          Return to G-AID
        </a>
        <div className="mt-10 border-t border-white/10 pt-6 text-sm text-[#888]">
          For any issues, visit{" "}
          <Link href="/" className="underline">
            g-aid.io
          </Link>
          .
        </div>
      </div>
    </main>
  );
}
