import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const sizes = {
  sm: { width: 60, height: 22 },
  md: { width: 80, height: 28 },
  lg: { width: 100, height: 36 },
};

export function Logo({
  className,
  size = "md",
  disableLink = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  disableLink?: boolean;
}) {
  const { width, height } = sizes[size];
  const image = (
    <Image
      src="/g-aid logo.png"
      alt="G-AID"
      width={width}
      height={height}
      className="object-contain"
      priority
    />
  );

  if (disableLink) {
    return <div className={cn("flex items-center", className)}>{image}</div>;
  }

  return (
    <Link href="/" className={cn("flex items-center group", className)}>
      {image}
    </Link>
  );
}
