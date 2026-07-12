import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/team";

const SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
} as const;

export type AvatarSize = keyof typeof SIZES;

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  if (src) {
    return (
      // MinIO signed URLs point at a per-environment host/port, so a plain
      // <img> is used here rather than next/image (which needs a static,
      // configured remote pattern per host).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn("rounded-full object-cover", SIZES[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-primary font-bold text-primary-foreground",
        SIZES[size],
        className,
      )}
    >
      {getInitials(name)}
    </div>
  );
}
