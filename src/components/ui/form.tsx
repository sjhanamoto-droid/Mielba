import * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[16px] text-ink placeholder:text-ink-faint transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-surface-sunken disabled:text-ink-muted";

export function Label({
  children,
  htmlFor,
  required,
  hint,
  className,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-soft", className)}
    >
      {children}
      {required && <span className="text-status-danger">*</span>}
      {hint && <span className="font-normal text-ink-faint">{hint}</span>}
    </label>
  );
}

export function Field({
  label,
  required,
  hint,
  htmlFor,
  children,
  className,
  description,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  description?: string;
}) {
  return (
    <div className={cn("", className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required} hint={hint}>
          {label}
        </Label>
      )}
      {children}
      {description && (
        <p className="mt-1 text-xs text-ink-faint">{description}</p>
      )}
    </div>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-12", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, "min-h-[96px] py-3 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        fieldBase,
        "h-12 appearance-none pr-10",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <svg
      className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  </div>
));
Select.displayName = "Select";
