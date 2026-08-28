import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

export function Avatar({
  name,
  color,
  image,
  size = "md",
  className,
}: {
  name: string;
  color?: string;
  /** プロフィール画像（任意・data URL 等）。あれば画像、無ければ色＋イニシャル。 */
  image?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-7 w-7 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-12 w-12 text-base",
  };
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn("inline-block shrink-0 rounded-full object-cover", sizes[size], className)}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        sizes[size],
        className,
      )}
      style={{ backgroundColor: color || "#2f63f5" }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
