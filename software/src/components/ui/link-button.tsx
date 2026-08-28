import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonProps } from "@/components/ui/button";

type LinkButtonProps = ButtonProps & {
  href: string;
};

export function LinkButton({
  href,
  className,
  variant,
  size,
  children,
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant, size, className }))}
    >
      {children}
    </Link>
  );
}
