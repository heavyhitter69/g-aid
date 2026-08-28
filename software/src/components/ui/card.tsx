import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  glow,
}: {
  className?: string;
  children: React.ReactNode;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "glass-panel rounded-xl p-6",
        glow && "glow-border",
        className
      )}
    >
      {children}
    </div>
  );
}
