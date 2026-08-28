"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string;
}

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            type={visible ? "text" : "password"}
            id={id}
            autoComplete={props.autoComplete ?? "current-password"}
            className={cn(
              "flex h-11 w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-4 pr-12 text-sm text-white placeholder:text-slate-500 transition-all duration-300",
              "focus:border-white/50 focus:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/10 focus:shadow-[0_0_20px_rgba(255,255,255,0.05)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-red-500/40",
              className
            )}
            ref={ref}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
