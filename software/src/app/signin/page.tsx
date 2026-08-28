"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { PublicLoginUnconfiguredNotice } from "@/components/auth/public-login-unconfigured-notice";

function DesktopSignInBody() {
  const [waitingForBrowser, setWaitingForBrowser] = useState(false);
  const [publicLoginConfigured, setPublicLoginConfigured] = useState<boolean | null>(null);
  const [publicLoginError, setPublicLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.gaidDesktop) {
      setPublicLoginConfigured(false);
      return;
    }
    window.gaidDesktop.isPublicLoginConfigured().then(setPublicLoginConfigured);
    return window.gaidDesktop.onAuthError((error) => {
      setWaitingForBrowser(false);
      setPublicLoginError(error.message || "Sign-in could not finish.");
    });
  }, []);

  const openBrowserAuth = async (mode: "login" | "signup") => {
    if (!window.gaidDesktop) return;
    setPublicLoginError(null);
    setWaitingForBrowser(true);
    const result = await window.gaidDesktop.startPublicLogin(mode);
    if (!result?.started) {
      setWaitingForBrowser(false);
      setPublicLoginError(
        result?.reason === "not_configured"
          ? "Online sign-in is not configured yet"
          : "Could not start browser sign-in."
      );
    }
  };

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
        ) : publicLoginConfigured === false ? (
          <div className="mt-10">
            <PublicLoginUnconfiguredNotice />
          </div>
        ) : (
          <div className="mt-10 space-y-3">
            {publicLoginError && (
              <p role="alert" className="text-sm text-red-400">
                {publicLoginError}
              </p>
            )}
            <button
              type="button"
              onClick={() => openBrowserAuth("login")}
              className="w-full h-12 rounded-lg bg-[#3b82f6] text-[#111] font-semibold hover:bg-[#60a5fa]"
              disabled={publicLoginConfigured !== true}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => openBrowserAuth("signup")}
              className="w-full h-12 rounded-lg bg-[#2a2a2a] text-white font-semibold hover:bg-[#333]"
              disabled={publicLoginConfigured !== true}
            >
              Sign Up
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#121212]" />}>
      <DesktopSignInBody />
    </Suspense>
  );
}
