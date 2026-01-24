import { cn } from "@/lib/utils";

type LogoProps = {
  variant?: "navbar" | "hero";
  className?: string;
};

export function Logo({ variant = "navbar", className }: LogoProps) {
  const size =
    variant === "hero"
      ? "h-28 w-auto sm:h-40"
      : "h-10 w-auto sm:h-12";

  return (
    <img
      src="/logo.png"
      alt="GotchiCloset logo"
      className={cn("block shrink-0", size, className)}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

