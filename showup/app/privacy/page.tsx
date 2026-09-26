import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "Privacy and recording · Showup" };

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy and recording">
      <ul className="list-disc space-y-2 pl-5 text-muted-foreground" data-testid="privacy-disclosure">
        <li>There are no accounts. Anyone who has a code can join, so share it only with people you want there.</li>
        <li>Hosts can record their showup session. While it records, everyone in it sees a red &ldquo;This showup session is being recorded&rdquo; banner.</li>
        <li>
          Only the host can download a recording, using the link they get when they leave the showup session, or with the session code and passcode.
          Guests can&rsquo;t see or download it.
        </li>
        <li>Recordings are deleted after 24 hours.</li>
        <li>The webcam overlay is put together in the presenter&rsquo;s own browser, not on a server.</li>
      </ul>
    </InfoPage>
  );
}
