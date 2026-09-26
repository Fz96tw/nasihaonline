import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "How it works · Showup" };

const STEPS = [
  { title: "Start with a code", body: "Pick any code you like (or tap Random) and share your screen." },
  { title: "Share the code", body: "Send the code to whoever should join. There are no accounts and no invites." },
  { title: "Guests join", body: "They enter the code and their name, and see your screen. Guests can ask to appear on it too." },
  { title: "Record and download", body: "Optional. Hosts can record the meeting and download it when it ends. Recordings are deleted after 24 hours." },
];

export default function HowItWorksPage() {
  return (
    <InfoPage title="How it works">
      <ol className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-1 rounded-xl border border-border p-4">
            <span className="text-sm font-semibold text-purple-400">Step {index + 1}</span>
            <span className="font-medium">{step.title}</span>
            <span className="text-sm text-muted-foreground">{step.body}</span>
          </li>
        ))}
      </ol>
    </InfoPage>
  );
}
