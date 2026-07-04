import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-subtle whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-card hover:bg-brand-700",
  accent: "bg-accent-500 text-white shadow-card hover:bg-accent-600",
  secondary: "bg-surface-sunken text-ink hover:bg-line",
  ghost: "bg-transparent text-ink-soft hover:bg-surface-sunken",
  danger: "bg-status-danger text-white hover:brightness-95",
  outline: "border border-line-strong bg-surface text-ink hover:bg-surface-subtle",
};

// タップターゲットは軍手前提で 40px 以上（md 以上は 44px 以上）を確保する
const sizes: Record<Size, string> = {
  sm: "h-10 px-3.5 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-[52px] px-5 text-base",
  icon: "h-11 w-11 p-0",
};

export function buttonClass(opts?: {
  variant?: Variant;
  size?: Size;
  className?: string;
}): string {
  return cn(
    base,
    variants[opts?.variant ?? "primary"],
    sizes[opts?.size ?? "md"],
    opts?.className,
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={buttonClass({ variant, size, className })}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export interface LinkButtonProps
  extends React.ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: LinkButtonProps) {
  return (
    <Link className={buttonClass({ variant, size, className })} {...props} />
  );
}
