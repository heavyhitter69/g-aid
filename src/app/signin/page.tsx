"use client";

import { Suspense, useEffect, useState } from "react";
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
import { useAppStore } from "@/store/app-store";
import { createClient } from "@/lib/supabase/client";
import { isDesktop } from "@/lib/desktop";
import { profileFromUser } from "@/lib/auth-user";
import { Mail, ChevronLeft } from "lucide-react";

function SignInBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openedFile = searchParams.get("open");
  const {
    setAuthenticated,
    setUser,
    onboardingComplete,
    user: existingUser,
    isAuthenticated,
    setCurrentProject,
    setProjectFiles,
    completeOnboarding,
  } = useAppStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(false);
  const [waitingForBrowser, setWaitingForBrowser] = useState(false);

  useEffect(() => {
    setDesktop(isDesktop());
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const dest = desktop || onboardingComplete ? "/workspace" : "/onboarding";
      router.replace(openedFile ? `/workspace?open=${encodeURIComponent(openedFile)}` : dest);
    } else if (existingUser?.email) {
      setEmail(existingUser.email);
    }
  }, [existingUser, isAuthenticated, router, onboardingComplete, desktop, openedFile]);

  const goAfterAuth = () => {
    if (desktop) {
      completeOnboarding();
      router.replace(openedFile ? `/workspace?open=${encodeURIComponent(openedFile)}` : "/workspace");
      return;
    }
    router.push(onboardingComplete ? "/workspace" : "/onboarding");
  };

  const openBrowserAuth = async (mode: "login" | "signup") => {
    if (!window.gaidDesktop) return;
    setWaitingForBrowser(true);
    const base = await window.gaidDesktop.getAuthBaseUrl();
    const path = mode === "signup" ? "/signup?desktop=1" : "/auth/desktop?mode=login";
    await window.gaidDesktop.openExternal(`${base}${path}`);
  };

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

    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setPasswordError(error.message);
        setLoading(false);
        return;
      }

      const sbUser = data.user;
      setCurrentProject(null);
      setProjectFiles([]);
      setUser(profileFromUser(sbUser));
      setAuthenticated(true);
      goAfterAuth();
    } catch {
      setPasswordError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  if (desktop) {
    return (
      <main className="relative min-h-screen flex items-center justify-center bg-[#121212] p-6">
        <div className="w-full max-w-sm text-center">
          <Image
            src="/g-aid logo.png"
            alt="G-AID"
            width={220}
            height={76}
            className="mx-auto object-contain"
            priority
          />
          <h1 className="mt-8 text-4xl font-bold tracking-[0.2em]">G-AID</h1>
          <p className="mt-3 text-white/80">The intelligent workspace for geophysics</p>
          {waitingForBrowser ? (
            <p className="mt-10 text-sm text-[#888]">
              Finish signing in in your browser, then return to G-AID.
            </p>
          ) : (
            <div className="mt-10 space-y-3">
              <button
                type="button"
                onClick={() => openBrowserAuth("login")}
                className="w-full h-12 rounded-lg bg-[#3b82f6] text-[#111] font-semibold hover:bg-[#60a5fa]"
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => openBrowserAuth("signup")}
                className="w-full h-12 rounded-lg bg-[#2a2a2a] text-white font-semibold hover:bg-[#333]"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center p-6">
      {!desktop && (
        <Link
          href="/"
          className="absolute top-6 left-6 z-30 flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 group backdrop-blur-sm shadow-lg shadow-black/20"
          title="Back to Home"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
        </Link>
      )}

      <AnimatedBackground variant="grid" />
      <motion.span
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full border border-white/5 pointer-events-none"
        animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.1, 0.3] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <PageTransition>
        <article className="w-full max-w-md glass-panel rounded-2xl p-8 border border-white/10">
          <Logo className="mb-8" disableLink={desktop} />
          <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
          <p className="text-slate-500 mb-8">
            Sign in to your{" "}
            <Image src="/g-aid logo.png" alt="G-AID" width={48} height={16} className="inline object-contain align-middle" />{" "}
            workspace
          </p>
          <form onSubmit={handleLogin} noValidate className="space-y-4">
            <Input
              label="Email"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@geomind.ai"
              error={emailError || undefined}
            />
            <PasswordInput
              label="Password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={passwordError || undefined}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Authenticating..." : "Sign In"}
            </Button>
          </form>
          <p className="my-6 text-center text-xs text-slate-500">OR</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" type="button">
              <Mail className="h-4 w-4" /> Google
            </Button>
            <Button variant="outline" type="button">
              GitHub
            </Button>
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            New to <Image src="/g-aid logo.png" alt="G-AID" width={40} height={14} className="inline object-contain align-middle" />?{" "}
            <Link href="/signup" className="text-white hover:underline">
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
