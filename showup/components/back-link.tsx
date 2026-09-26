import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** The "Back to Showup" link at the top left of every page except the landing page. */
export function BackLink() {
  return (
    <Link href="/" className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to Showup
    </Link>
  );
}
