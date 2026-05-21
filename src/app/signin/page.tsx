"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PageTransition } from "@/components/shared/page-transition";
import { useAppStore } from "@/store/app-store";
import { Mail, ChevronLeft } from "lucide-react";

export default function SignInPage() {
  const router = useRouter();
  const { 
    setAuthenticated, 
    setUser, 
    onboardingComplete, 
    user: existingUser,
    setCurrentProject,
    setProjectFiles
  } = useAppStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (existingUser?.email) {
      setEmail(existingUser.email);
    }
  }, [existingUser]);

  const handleLogin = (e: React.FormEvent) => {
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
    
    // Always start with a fresh workspace state on login
    setCurrentProject(null);
    setProjectFiles([]);
    
    if (!existingUser) {
      setUser({
        fullName: "Dr. Alex Chen",
        institution: "GeoMind Research",
        email: email || "alex@geomind.ai",
        role: "researcher",
        discipline: null,
      });
    } else if (email && email !== existingUser.email) {
      setUser({
        ...existingUser,
        email: email,
      });
    }
    
    setAuthenticated(true);
    setTimeout(() => {
      router.push(onboardingComplete ? "/workspace" : "/onboarding");
    }, 600);
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center p-6">
      {/* Back Button */}
      <Link 
        href="/" 
        className="absolute top-6 left-6 z-30 flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 group backdrop-blur-sm shadow-lg shadow-black/20"
        title="Back to Home"
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
          <p className="text-slate-500 mb-8">Sign in to your <Image src="/g-aid logo.png" alt="G-AID" width={48} height={16} className="inline object-contain align-middle" /> workspace</p>
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
