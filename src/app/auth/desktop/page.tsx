"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

export default function DesktopAuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "signup") {
      router.replace("/signup?desktop=1");
    }
  }, [mode, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);

    if (!email.trim()) {
      setEmailError("Email address is required.");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setPasswordError("Password is required.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.session) {
      setPasswordError(error?.message ?? "Could not sign in.");
      setLoading(false);
      return;
    }

    router.push("/auth/desktop/confirm");
  };

  if (mode === "signup") {
    return (
      <main className="min-h-screen bg-[#0b0b0b] text-[#888] flex items-center justify-center">
        Redirecting to sign up...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0b0b] text-white flex flex-col">
      <header className="px-8 pt-8 flex items-center gap-3">
        <Image src="/g-aid logo.png" alt="G-AID" width={88} height={30} className="object-contain" priority />
      </header>

      <section className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <h1 className="text-4xl font-semibold tracking-tight">Welcome to G-AID</h1>
          <p className="mt-3 text-[#888] text-[17px]">The new way to interpret geophysical data with AI.</p>

          <form onSubmit={handleSubmit} noValidate className="mt-10 space-y-4">
            <Input
              label="Email"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              error={emailError || undefined}
            />
            <PasswordInput
              label="Password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={passwordError || undefined}
            />
            <Button
              type="submit"
              className="w-full h-12 rounded-md bg-[#2a2a2a] text-white hover:bg-[#333]"
              disabled={loading}
            >
              {loading ? "Continuing..." : "Continue with email"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-[#888]">
            Don&apos;t have an account?{" "}
            <Link href="/signup?desktop=1" className="text-white hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </section>

      <footer className="pb-8 text-center text-xs text-[#666]">
        <Link href="/terms" className="hover:underline">Terms of Service</Link>
        {" and "}
        <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
      </footer>
    </main>
  );
}
