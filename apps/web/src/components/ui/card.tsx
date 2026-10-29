import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-2xl bg-zinc-900 ring-1 ring-white/10", className)} {...props} />;
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function CardHeader({ title, description, actions }: CardHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
