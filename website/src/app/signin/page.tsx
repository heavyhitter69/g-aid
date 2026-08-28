"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PageTransition } from "@/components/shared/page-transition";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { ChevronLeft } from "lucide-react";
import { AuthUnavailableNotice } from "@/components/auth/auth-unavailable-notice";
import { readDesktopAuthRequest, withDesktopAuthQuery } from "@/lib/desktop-auth/contract";

function SignInBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const desktopRequest = useMemo(() => readDesktopAuthRequest(searchParams), [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [authConfigured] = useState(() => hasSupabaseConfig());

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);

    let hasError = false;
    if (!email.trim()) {
      setEmailError("Email address is required.");
      hasError = true;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Please enter a valid email address.");
      hasError = true;
    }
    if (!password) {
      setPasswordError("Password is required.");
      hasError = true;
    }
    if (hasError) return;

    if (!authConfigured) {
      setPasswordError("Sign-in is not available in this environment.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setPasswordError(error.message);
        setLoading(false);
        return;
      }

      router.replace(
        desktopRequest
          ? withDesktopAuthQuery("/auth/desktop/confirm", desktopRequest)
          : "/"
      );
    } catch {
      setPasswordError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center p-6">
      <Link
        href={desktopRequest ? withDesktopAuthQuery("/auth/desktop", desktopRequest, { mode: "login" }) : "/"}
        className="absolute top-6 left-6 z-30 flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 group backdrop-blur-sm shadow-lg shadow-black/20"
        title="Back"
      >
        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
      </Link>

      <AnimatedBackground variant="grid" />
      <motion.span
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full border border-white/5 pointer-events-none"
        animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.1, 0.3] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <PageTransition>
        <article className="w-full max-w-md glass-panel rounded-2xl p-8 border border-white/10">
          <Logo className="mb-8" />
          <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
          <p className="text-slate-500 mb-8">
            Sign in with email if authentication is configured. This is not a public cloud workspace.
          </p>
          {!authConfigured && (
            <div className="mb-6">
              <AuthUnavailableNotice />
            </div>
          )}
          <form onSubmit={handleLogin} noValidate className="space-y-4">
            <Input
              label="Email"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.org"
              error={emailError || undefined}
              disabled={!authConfigured}
            />
            <PasswordInput
              label="Password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={passwordError || undefined}
            />
            <Button type="submit" className="w-full" disabled={loading || !authConfigured}>
              {loading ? "Authenticating..." : authConfigured ? "Sign In" : "Sign-in unavailable"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            New to{" "}
            <Image
              src="/g-aid logo.png"
              alt="G-AID"
              width={40}
              height={14}
              className="inline object-contain align-middle"
            />
            ?{" "}
            <Link
              href={desktopRequest ? withDesktopAuthQuery("/signup", desktopRequest, { desktop: "1" }) : "/signup"}
              className="text-white hover:underline"
            >
              Create account
            </Link>
          </p>
        </article>
      </PageTransition>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#121212]" />}>
      <SignInBody />
    </Suspense>
  );
}
