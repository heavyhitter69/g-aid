"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

const selectFieldClass =
  "flex h-11 w-full appearance-none rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white transition-all duration-300 focus:border-white/50 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/10 disabled:cursor-not-allowed disabled:opacity-50";

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400"
        >
          {label}
        </label>
      )}
      <select
        id={id}
        ref={ref}
        className={cn(
          selectFieldClass,
          error && "border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  )
);
Select.displayName = "Select";

export { Select };
