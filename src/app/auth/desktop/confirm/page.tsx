"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { desktopHandoffUrl } from "@/lib/desktop";
import { profileFromUser } from "@/lib/auth-user";

export default function DesktopConfirmPage() {
  const router = useRouter();
  const [name, setName] = useState("G-AID user");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [handingOff, setHandingOff] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      router.replace("/auth/desktop?mode=login");
      return;
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session?.user) {
        router.replace("/auth/desktop?mode=login");
        return;
      }
      const profile = profileFromUser(data.session.user);
      setName(profile.fullName);
      setEmail(profile.email);
      setLoading(false);
    });
  }, [router]);

  const completeHandoff = async () => {
    setHandingOff(true);
    if (!hasSupabaseConfig()) {
      router.replace("/auth/desktop?mode=login");
      return;
    }
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/auth/desktop?mode=login");
      return;
    }
    window.location.href = desktopHandoffUrl(
      data.session.access_token,
      data.session.refresh_token
    );
    window.setTimeout(() => router.replace("/auth/desktop/done"), 600);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b0b0b] text-[#888] flex items-center justify-center">
        Checking your account...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0b0b] text-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <Image src="/g-aid logo.png" alt="G-AID" width={88} height={30} className="object-contain mb-10" priority />
        <h1 className="text-4xl font-semibold tracking-tight">Sign in to G-AID desktop.</h1>
        <p className="mt-3 text-[#888] text-[17px]">
          The G-AID desktop app is asking to sign in with this account.
        </p>

        <div className="mt-8 rounded-xl border border-white/10 bg-[#161616] px-5 py-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-[#2a2a2a] flex items-center justify-center text-lg font-semibold">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white font-medium truncate">{name}</p>
            <p className="text-sm text-[#888] truncate">{email}</p>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/auth/desktop?mode=login")}
            className="h-11 px-5 rounded-lg bg-[#2a2a2a] text-white text-sm font-medium hover:bg-[#333]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={completeHandoff}
            disabled={handingOff}
            className="h-11 px-5 rounded-lg bg-[#d4d4d4] text-black text-sm font-semibold hover:bg-white disabled:opacity-60"
          >
            {handingOff ? "Opening G-AID..." : "Sign in"}
          </button>
        </div>

        <p className="mt-10 text-xs text-[#666]">
          Only continue if you just opened this page from the G-AID app.
        </p>
      </div>
    </main>
  );
}
