import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "Browser support · Showup" };

export default function BrowserSupportPage() {
  return (
    <InfoPage title="Browser support">
      <p className="text-muted-foreground" data-testid="browser-support">
        The webcam overlay (showing yourself over your shared screen) works in Chrome and Edge on a computer only. Every other browser can
        still join and watch, and sharing a screen works in most desktop browsers, though not on phones.
      </p>
    </InfoPage>
  );
}
