export const EDUCATIONAL_DISCLAIMER =
  "DISCLAIMER: NASIHA is for informational and educational purposes only. Our website is not intended to be a substitute for professional advice. NASIHA and its members accept no liability for decisions made based on content shared within the community.";

// Shown on /meet/event/[id]'s click-through gate (meeting-join-experience)
// before an attendee is redirected into an `open` event's Meet call — only
// events open to non-members, since a signed-in member already agreed to
// CODE_OF_CONDUCT_PRINCIPLES once at /join. Distinct from that array: this
// is meeting-specific (recording, redistribution, host removal), not the
// general community membership agreement.
export const PUBLIC_MEETING_DISCLAIMER_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "Recording",
    body: "This meeting may be recorded or transcribed. By joining, you consent to being recorded and to that recording being used by NASIHA for community and educational purposes.",
  },
  {
    heading: "No unauthorized sharing",
    body: "The meeting link, and any recording, are for your own use. Please don't republish, redistribute, or share them outside this meeting without NASIHA's permission.",
  },
  {
    heading: "Not professional advice",
    body: "NASIHA is for informational and educational purposes only. Content shared in this meeting is not intended to be a substitute for professional advice. NASIHA and its members accept no liability for decisions made based on content shared in this meeting.",
  },
];

export const PUBLIC_MEETING_CODE_OF_CONDUCT = [
  "Share honestly. Only teach within your areas of competence. Be clear about the limits of your knowledge.",
  "Engage respectfully. Disagree with ideas, not people. Critique work constructively and with kindness.",
  "Protect privacy. Never share patient information or personal data of others.",
  "Uphold the mission. Do not use this meeting for commercial gain, self-promotion, or any purpose at odds with free knowledge sharing.",
];

/**
 * Platform-specific — the host may have chosen Google Meet or LiveKit at
 * creation time (LiveKit Meeting Infrastructure initiative). The recording
 * line applies to both: Google Meet auto-records today (autoRecordingGeneration:
 * "ON", see google-calendar.ts); LiveKit's own recording (egress-to-storage)
 * is still deferred (see livekit.ts's createLiveKitRoom doc comment) but the
 * user directed this notice be shown for LiveKit now regardless, ahead of
 * that work landing (2026-08-25) — keep this comment in sync once egress
 * ships so it stops describing a stated intent as already-built.
 */
export function getPublicMeetingClosingNote(platform: "google_meet" | "livekit"): string {
  const platformNote =
    platform === "livekit"
      ? "This meeting is hosted on a third-party video platform; your use of it is also subject to that platform's own Terms of Service."
      : "This meeting is hosted on Google Meet; your use of it is also subject to Google's own Terms of Service.";
  return `The host reserves the right to remove any participant for disruptive or inappropriate behavior. Please be respectful and abide by NASIHA's Terms of Service. This meeting will be recorded, and the recording will be made available in the event's details after the meeting has ended. ${platformNote}`;
}

// Source of truth: docs/Nasiha_Charter.md § Code of Conduct.
export const CODE_OF_CONDUCT_PRINCIPLES = [
  "Share honestly. Only teach within your areas of competence. Be clear about the limits of your knowledge.",
  "Give generously. Contribute without expectation of immediate return. Trust that the community will reciprocate.",
  "Receive graciously. Acknowledge and credit those who help you. Recognize that someone gave their time.",
  "Engage respectfully. Disagree with ideas, not people. Critique work constructively and with kindness.",
  "Protect privacy. Never share patient information or personal member data outside the community.",
  "Uphold the mission. Do not use NASIHA for commercial gain, self-promotion, or any purpose at odds with free knowledge sharing.",
  "Report concerns. If you witness behavior that violates these principles, bring it to the Board.",
];
