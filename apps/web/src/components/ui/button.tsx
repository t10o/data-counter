import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

const variants = {
  primary: "bg-zinc-100 text-zinc-900 hover:bg-white",
  secondary: "bg-white/5 text-zinc-100 ring-1 ring-white/10 hover:bg-white/10",
  ghost: "text-zinc-300 hover:bg-white/5 hover:text-zinc-100",
} as const;

interface ButtonProps extends ComponentProps<"button"> {
  variant?: keyof typeof variants;
}

export function Button({ variant = "secondary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
