import "dotenv/config";
import { createServer } from "node:http";
import { google } from "googleapis";

const PORT = 4321;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/meetings.space.settings",
  // Reading conferenceRecords/recordings for the post-meeting recording
  // sync (lib/meeting-recordings-sync.ts).
  "https://www.googleapis.com/auth/meetings.space.readonly",
  // Deleting a recording's underlying Drive file (lib/google-calendar.ts's
  // deleteMeetingRecording) — the narrower drive.file scope only covers
  // files created through this app's own OAuth client, which a
  // Meet-generated recording isn't, so this needs the broader grant.
  "https://www.googleapis.com/auth/drive",
];

/**
 * One-time setup script (see plan doc / PRD §4.7 meeting-request Meet
 * integration): obtains a long-lived refresh token for the single dedicated
 * Gmail account that will "own" every auto-generated meeting event. Run
 * once, signed in as that account (not your personal account), then paste
 * the printed refresh token into GOOGLE_CALENDAR_REFRESH_TOKEN.
 *
 * Requires GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET already set (web/.env) from
 * a "Desktop app" OAuth client in Google Cloud Console — that client type
 * accepts any localhost redirect port without pre-registering this exact
 * one (RFC 8252).
 *
 * Usage: npx tsx scripts/get-google-refresh-token.ts
 */
async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in web/.env first.");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\nSign in as the dedicated Gmail account that should own meeting events, then open:\n");
  console.log(authUrl);
  console.log(`\nWaiting for the OAuth redirect on ${REDIRECT_URI} ...\n`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.end(`Authorization failed: ${error}. You can close this tab.`);
        server.close();
        reject(new Error(error));
        return;
      }
      if (!code) {
        res.end("Missing authorization code.");
        return;
      }

      res.end("Authorization complete — you can close this tab and return to the terminal.");
      server.close();
      resolve(code);
    });
    server.listen(PORT);
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh token returned. This account may have already granted consent before — " +
        "revoke NASIHA's access at https://myaccount.google.com/permissions and re-run this script.",
    );
    process.exit(1);
  }

  console.log("\nGOOGLE_CALENDAR_REFRESH_TOKEN=\"" + tokens.refresh_token + "\"\n");
  console.log("Paste that into web/.env (and your deployment secrets).");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
