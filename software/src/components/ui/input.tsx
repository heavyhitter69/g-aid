"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, type, id, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400"
        >
          {label}
        </label>
      )}
      <input
        type={type}
        id={id}
        className={cn(
          "flex h-11 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 transition-all duration-300",
          "focus:border-white/50 focus:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/10 focus:shadow-[0_0_20px_rgba(255,255,255,0.05)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-red-500/40 focus:border-red-500",
          className
        )}
        ref={ref}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-[11px] text-red-400 font-mono flex items-center gap-1.5 animate-slide-down">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
);
Input.displayName = "Input";

export { Input };
