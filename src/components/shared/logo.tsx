import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const sizes = {
  sm: { width: 60, height: 22 },
  md: { width: 80, height: 28 },
  lg: { width: 100, height: 36 },
};

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const { width, height } = sizes[size];
  return (
    <Link href="/" className={cn("flex items-center group", className)}>
      <Image
        src="/g-aid logo.png"
        alt="G-AID"
        width={width}
        height={height}
        className="object-contain"
        priority
      />
    </Link>
  );
}
