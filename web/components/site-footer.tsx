import { EDUCATIONAL_DISCLAIMER } from "@/lib/legal";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-[1280px] px-8 py-6">
        <p className="text-xs text-muted-foreground">{EDUCATIONAL_DISCLAIMER}</p>
      </div>
    </footer>
  );
}
