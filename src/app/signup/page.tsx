"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useAppStore } from "@/store/app-store";
import { getAgentForDiscipline, DISCIPLINES } from "@/lib/data";
import type { DisciplineId, UserRole } from "@/types";
import {
  Waves, Zap, Droplets, Fuel, Pickaxe, Compass, Leaf,
  ArrowRight, CheckCircle2, User, Mail, Lock, ChevronLeft, ChevronRight, AlertCircle,
} from "lucide-react";

const disciplineIcons: Record<string, React.ElementType> = {
  waves: Waves, zap: Zap, droplets: Droplets, fuel: Fuel,
  pickaxe: Pickaxe, compass: Compass, leaf: Leaf,
};

const ROLES: { value: UserRole; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "researcher", label: "Researcher" },
  { value: "consultant", label: "Consultant" },
  { value: "exploration", label: "Exploration Company" },
];

const inputClass =
  "flex h-11 w-full rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10 transition-all";

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -40 }),
};

export default function SignUpPage() {
  const router = useRouter();
  const { setUser, setAuthenticated, setOnboardingStep, setDiscipline, setAgent, patchUser } = useAppStore();

  const [phase, setPhase] = useState<1 | 2>(1);
  const [direction, setDirection] = useState(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 1 fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Phase 2 fields
  const [institution, setInstitution] = useState("");
  const [role, setRole] = useState<UserRole>("researcher");
  const [pickedDiscipline, setPickedDiscipline] = useState<DisciplineId | null>(null);

  // Errors state
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [institutionError, setInstitutionError] = useState<string | null>(null);
  const [disciplineError, setDisciplineError] = useState<string | null>(null);

  const handlePhase1Next = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFullNameError(null);
    setEmailError(null);
    setPasswordError(null);
    setConfirmError(null);

    let hasError = false;
    if (!fullName.trim()) {
      setFullNameError("Full Name is required.");
      hasError = true;
    }
    if (!email.trim()) {
      setEmailError("Email address is required.");
      hasError = true;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Please enter a valid email address.");
      hasError = true;
    }
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      hasError = true;
    }
    if (password !== confirm) {
      setConfirmError("Passwords do not match.");
      hasError = true;
    }

    if (hasError) return;

    setDirection(1);
    setPhase(2);
  };

  const handleBack = () => {
    setDirection(-1);
    setPhase(1);
    setError(null);
    setFullNameError(null);
    setEmailError(null);
    setPasswordError(null);
    setConfirmError(null);
    setInstitutionError(null);
    setDisciplineError(null);
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInstitutionError(null);
    setDisciplineError(null);

    let hasError = false;
    if (!institution.trim()) {
      setInstitutionError("Company or Institution name is required.");
      hasError = true;
    }
    if (!pickedDiscipline) {
      setDisciplineError("Please select your primary discipline.");
      hasError = true;
    }

    if (hasError) return;

    setCreating(true);

    // Commit user to store
    setUser({
      fullName: fullName.trim(),
      institution: institution.trim(),
      email: email.trim(),
      role,
      discipline: pickedDiscipline,
    });
    setAuthenticated(true);
    setDiscipline(pickedDiscipline!);
    const agent = getAgentForDiscipline(pickedDiscipline!);
    setAgent(agent);
    setOnboardingStep("welcome");
    router.push("/onboarding");
  };

  return (
    <main className="relative min-h-screen">
      {/* Back Button */}
      <Link 
        href="/" 
        className="absolute top-6 left-6 z-55 flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 group backdrop-blur-sm shadow-lg shadow-black/20"
        title="Back to Home"
      >
        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
      </Link>

      <AnimatedBackground variant="particles" />

      <div className="relative z-10 flex min-h-screen">
        {/* Left panel – decorative */}
        <aside className="hidden lg:flex lg:w-5/12 items-center justify-center p-12">
          <figure className="glass-panel rounded-2xl p-8 w-80 border border-white/10 space-y-4">
            <p className="font-mono text-xs text-white/40 uppercase tracking-widest">ACCOUNT SETUP</p>
            {/* Step indicators */}
            <div className="space-y-3 mt-4">
              {[
                { num: 1, label: "Your credentials", active: phase === 1, done: phase === 2 },
                { num: 2, label: "Your profile", active: phase === 2, done: false },
              ].map((s) => (
                <div key={s.num} className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-mono transition-all duration-300 ${
                      s.done
                        ? "border-white/60 bg-white/10 text-white"
                        : s.active
                        ? "border-white bg-white text-black font-bold"
                        : "border-white/20 text-white/30"
                    }`}
                  >
                    {s.done ? <CheckCircle2 className="w-3 h-3" /> : s.num}
                  </span>
                  <span className={`text-sm transition-colors duration-300 ${s.active ? "text-white" : s.done ? "text-white/60" : "text-white/20"}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
            {/* Decorative bars */}
            <div className="mt-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-0.5 rounded-full bg-white/10 transition-all duration-700"
                  style={{ width: `${40 + i * 14}%` }}
                />
              ))}
            </div>
            <p className="text-xs text-zinc-600 font-mono mt-4">
              Calibrating geophysical interpretation models...
            </p>
          </figure>
        </aside>

        {/* Right panel – form */}
        <section className="flex flex-1 items-center justify-center p-6 lg:p-12">
          <article className="w-full max-w-md glass-panel rounded-2xl border border-white/10 p-8 shadow-2xl overflow-hidden">
            <Logo className="mb-6" />

            {/* Progress bar */}
            <div className="mb-6 h-0.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white/40 rounded-full"
                animate={{ width: phase === 1 ? "50%" : "100%" }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              />
            </div>

            <AnimatePresence mode="wait" custom={direction}>
              {phase === 1 && (
                <motion.div
                  key="phase1"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <h1 className="text-2xl font-bold mb-1 text-white">Create your account</h1>
                  <p className="text-zinc-500 mb-6 text-sm">Step 1 of 2 — Your credentials</p>

                  {error && (
                    <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      {error}
                    </p>
                  )}

                  <form onSubmit={handlePhase1Next} noValidate className="space-y-4">
                    <div>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
                        <input
                          className={inputClass + " pl-10" + (fullNameError ? " border-red-500/50 focus:border-red-500" : "")}
                          id="name"
                          placeholder="Full Name"
                          autoComplete="name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                        />
                      </div>
                      {fullNameError && (
                        <p className="mt-1.5 text-[11px] text-red-400 font-mono flex items-center gap-1.5 animate-slide-down">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {fullNameError}
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
                        <input
                          className={inputClass + " pl-10" + (emailError ? " border-red-500/50 focus:border-red-500" : "")}
                          id="email"
                          type="email"
                          placeholder="Email address"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      {emailError && (
                        <p className="mt-1.5 text-[11px] text-red-400 font-mono flex items-center gap-1.5 animate-slide-down">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {emailError}
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
                        <input
                          className={inputClass + " pl-10" + (passwordError ? " border-red-500/50 focus:border-red-500" : "")}
                          id="pass"
                          type="password"
                          placeholder="Password (min. 8 characters)"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                      {passwordError && (
                        <p className="mt-1.5 text-[11px] text-red-400 font-mono flex items-center gap-1.5 animate-slide-down">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {passwordError}
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
                        <input
                          className={inputClass + " pl-10" + (confirmError ? " border-red-500/50 focus:border-red-500" : "")}
                          id="confirm"
                          type="password"
                          placeholder="Confirm password"
                          autoComplete="new-password"
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                        />
                      </div>
                      {confirmError && (
                        <p className="mt-1.5 text-[11px] text-red-400 font-mono flex items-center gap-1.5 animate-slide-down">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {confirmError}
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2 h-11 rounded-lg bg-white text-black font-semibold text-sm hover:bg-zinc-100 active:bg-zinc-200 transition-all duration-200 group mt-2"
                    >
                      Next
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </form>

                  <p className="mt-6 text-center text-sm text-zinc-600">
                    Already have an account?{" "}
                    <Link href="/signin" className="text-white/80 hover:text-white hover:underline">
                      Sign in
                    </Link>
                  </p>
                </motion.div>
              )}

              {phase === 2 && (
                <motion.div
                  key="phase2"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <h1 className="text-2xl font-bold mb-1 text-white">Customize your workspace</h1>
                  <p className="text-zinc-500 mb-6 text-sm">Step 2 of 2 — Your profile &amp; discipline</p>

                  {error && (
                    <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      {error}
                    </p>
                  )}

                  <form onSubmit={handleCreateAccount} noValidate className="space-y-5">
                    {/* Institution */}
                    <div>
                      <label className="block mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Company / Institution
                      </label>
                      <input
                        className={inputClass + (institutionError ? " border-red-500/50 focus:border-red-500" : "")}
                        id="institution"
                        placeholder="e.g. GeoSurvey Institute"
                        autoComplete="organization"
                        value={institution}
                        onChange={(e) => setInstitution(e.target.value)}
                      />
                      {institutionError && (
                        <p className="mt-1.5 text-[11px] text-red-400 font-mono flex items-center gap-1.5 animate-slide-down">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {institutionError}
                        </p>
                      )}
                    </div>

                    {/* Role */}
                    <div>
                      <label className="block mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Role
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {ROLES.map((r) => (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => setRole(r.value)}
                            className={`h-9 rounded-lg border text-sm font-medium transition-all duration-200 ${
                              role === r.value
                                ? "border-white/40 bg-white/10 text-white"
                                : "border-white/10 bg-transparent text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Discipline */}
                    <div>
                      <label className="block mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Primary Discipline
                      </label>
                      <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                        {DISCIPLINES.map((d) => {
                          const Icon = disciplineIcons[d.icon] || Waves;
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => setPickedDiscipline(d.id)}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-sm transition-all duration-200 ${
                                pickedDiscipline === d.id
                                  ? "border-white/40 bg-white/10 text-white"
                                  : "border-white/10 bg-transparent text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                              }`}
                            >
                              <Icon className="w-4 h-4 shrink-0" />
                              <span className="truncate text-xs">{d.shortName}</span>
                            </button>
                          );
                        })}
                      </div>
                      {disciplineError && (
                        <p className="mt-1.5 text-[11px] text-red-400 font-mono flex items-center gap-1.5 animate-slide-down">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {disciplineError}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handleBack}
                        className="h-11 px-4 rounded-lg border border-white/10 text-zinc-400 text-sm hover:border-white/20 hover:text-zinc-200 transition-all"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={creating}
                        className="flex-1 h-11 rounded-lg bg-white text-black font-semibold text-sm hover:bg-zinc-100 active:bg-zinc-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {creating ? "Creating account..." : "Done — Create Account"}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </article>
        </section>
      </div>
    </main>
  );
}
