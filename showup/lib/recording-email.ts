import "server-only";
import { Resend } from "resend";
import {
  claimEmail,
  deletePendingEmail,
  describeRecording,
  getMeta,
  isFinishedAndIdle,
  readPendingEmail,
  releaseEmailClaim,
} from "@/lib/recordings";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL || "Showup <no-reply@mail.nasihaforyou.org>";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://showup.cloudcurio.com").replace(/\/$/, "");

export const isEmailConfigured = () => resend !== null;

/**
 * Sends the host their recording link once the meeting has finished and every
 * recording part has ended (a link sent earlier would show "still preparing").
 * Called from the webhook and from status polls, so it is idempotent: one
 * process wins the claim and sends; a failed send releases the claim so a later
 * trigger can retry. The address (and the hostSecret used to build the link)
 * are deleted the moment the mail is handed to Resend.
 */
export async function maybeSendRecordingEmail(recId: string): Promise<"sent" | "waiting" | "none"> {
  const pending = await readPendingEmail(recId);
  if (!pending) return "none";
  if (!(await isFinishedAndIdle(recId))) return "waiting";
  if (!resend) return "waiting";

  const meta = await getMeta(recId);
  if (!meta) return "none";
  if (!(await claimEmail(recId))) return "waiting";

  try {
    const view = await describeRecording(meta);
    const link = `${APP_URL}/recording/${recId}#${pending.hostSecret}`;
    const ok = view.status === "ready";
    const { error } = await resend.emails.send({
      from: FROM,
      to: pending.email,
      subject: ok ? "Your Showup recording is ready" : "Your Showup recording",
      text: ok
        ? `Your screen-share recording is ready to download:\n\n${link}\n\nThe link and the recording expire 24 hours after the recording started. Anyone with this link can download the recording, so keep it private.\n\n- Showup`
        : `Showup couldn't finish your recording. Details and any recovered parts:\n\n${link}\n\nThe link expires 24 hours after the recording started.\n\n- Showup`,
    });
    if (error) throw new Error(error.message);
    await deletePendingEmail(recId);
    return "sent";
  } catch (error) {
    console.error("[recording-email] send failed", error);
    await releaseEmailClaim(recId);
    return "waiting";
  }
}
