/**
 * Profile.linkedinUrl / MembershipApplication.linkedinUrl (§4.3/§3.1) accept
 * any http(s) URL, not just LinkedIn — labels a rendered link "LinkedIn"
 * only when the hostname actually is linkedin.com, falling back to the
 * generic "Website" otherwise. Tolerant of a non-parseable value (e.g. a
 * bare handle copied in from an application that predates URL validation
 * there) rather than throwing.
 */
export function getProfileLinkLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) return "LinkedIn";
  } catch {
    // Not a parseable absolute URL — fall through to the generic label.
  }
  return "Website";
}
