"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { useAppStore } from "@/store/app-store";
import { isDesktop, parseGaidAuthUrl } from "@/lib/desktop";
import { profileFromUser } from "@/lib/auth-user";

const MARKETING_OR_AUTH = new Set(["/", "/signin", "/signup", "/onboarding"]);

export function DesktopSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const appliedUrl = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const setAuthenticated = useAppStore((s) => s.setAuthenticated);
  const setUser = useAppStore((s) => s.setUser);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);

  useEffect(() => {
    const persist = useAppStore.persist;
    if (!persist) {
      setHydrated(true);
      return;
    }
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;

    try {
      const supabase = createClient();

      const applySessionUser = (user: Parameters<typeof profileFromUser>[0] | null) => {
        if (!user) return;
        setUser(profileFromUser(user));
        setAuthenticated(true);
      };

      void supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) {
          applySessionUser(data.session.user);
        }
      });

      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          applySessionUser(session.user);
        } else if (event === "SIGNED_OUT") {
          setAuthenticated(false);
          setUser(null);
        }
      });

      return () => {
        data.subscription.unsubscribe();
      };
    } catch {
      return;
    }
  }, [setAuthenticated, setUser]);

  useEffect(() => {
    if (!isDesktop() || !window.gaidDesktop) return;

    const applyAuthUrl = async (url: string | null) => {
      if (!url || appliedUrl.current === url) return;
      const tokens = parseGaidAuthUrl(url);
      if (!tokens || !hasSupabaseConfig()) return;
      appliedUrl.current = url;

      const supabase = createClient();
      const { data, error } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (error || !data.user) {
        appliedUrl.current = null;
        return;
      }

      setUser(profileFromUser(data.user));
      setAuthenticated(true);
      const done = useAppStore.getState().onboardingComplete;
      router.replace(done ? "/workspace" : "/onboarding");
    };

    window.gaidDesktop.getPendingAuthUrl().then(applyAuthUrl);
    return window.gaidDesktop.onAuthCallback(applyAuthUrl);
  }, [router, setAuthenticated, setUser]);

  useEffect(() => {
    if (!hydrated || !isDesktop()) return;

    window.gaidDesktop?.dismissBootCover?.();

    const openedFile = new URLSearchParams(window.location.search).has("open");

    if (isAuthenticated) {
      if (!onboardingComplete && !openedFile && pathname !== "/onboarding") {
        router.replace("/onboarding");
        return;
      }
      if (onboardingComplete && MARKETING_OR_AUTH.has(pathname)) {
        router.replace("/workspace");
      }
      return;
    }

    if (pathname === "/" || pathname === "/workspace" || pathname === "/onboarding") {
      router.replace("/signin");
    }
  }, [hydrated, isAuthenticated, onboardingComplete, pathname, router]);

  return (
    <>
      {isDesktop() && pathname !== "/workspace" && (
        <div className="fixed top-0 left-0 right-[138px] h-[36px] z-[200] gaid-drag" />
      )}
      {children}
    </>
  );
}
