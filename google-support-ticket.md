Subject: Google Meet API spaces.patch returns 403 "Permission denied on resource Space" despite correct scope, fresh consent, and space ownership

Summary
-------
Calls to the Google Meet API v2 `spaces.patch` method consistently fail with a 403
error for a Workspace-domain account that is both the OAuth-authorized caller and
the owner/organizer of the target space. This has been reproduced on every attempt
since the feature was first built (see timeline below) — across multiple full
revoke-and-reconsent cycles and multiple different scope combinations — and has
never once succeeded.

Environment
-----------
- Workspace edition: Business Standard
- Domain: nasihaforyou.org
- Affected account: [fill in — the dedicated Gmail/Workspace account used for this integration]
- OAuth Client ID: 41265714390-ec981suttlputahb5toou911lgdh3r8l.apps.googleusercontent.com
- OAuth Client type: Desktop app
- API: Google Meet API v2 (meet.googleapis.com), method `spaces.patch`
- Client library: googleapis (Node.js), google-api-nodejs-client/8.0.3
- App access control (Admin Console): this OAuth client is listed as "Trusted"

Error
-----
    403 Permission denied on resource Space (or it might not exist)
    status: PERMISSION_DENIED

Occurs on every `spaces.patch` call, regardless of which config field is being set
(reproduced identically for both `config.accessType` and
`config.artifactConfig.recordingConfig.autoRecordingGeneration`).

Steps to reproduce
-------------------
1. Authenticate as the affected account via OAuth2 (refresh-token flow,
   access_type=offline, prompt=consent), requesting scopes:
   - https://www.googleapis.com/auth/calendar.events
   - https://www.googleapis.com/auth/meetings.space.settings
   - https://www.googleapis.com/auth/meetings.space.readonly
2. Confirm the issued token actually carries the requested scopes via
   `GET https://oauth2.googleapis.com/tokeninfo?access_token=...` — confirmed
   present.
3. Create a Calendar event as this account with an auto-generated Meet link:
   `calendar.events.insert` with `conferenceDataVersion: 1` and
   `conferenceData.createRequest.conferenceSolutionKey.type = "hangoutsMeet"`.
   This succeeds and returns a valid `hangoutLink`.
4. Immediately call `meet.spaces.patch` on the resulting space
   (`spaces/{meetingCode}`, derived from the hangoutLink), e.g.:
   ```
   meet.spaces.patch({
     name: "spaces/<meetingCode>",
     updateMask: "config.artifactConfig.recordingConfig.autoRecordingGeneration",
     requestBody: { config: { artifactConfig: { recordingConfig: { autoRecordingGeneration: "ON" } } } },
   })
   ```
5. Result: 403 `PERMISSION_DENIED`, "Permission denied on resource Space (or it
   might not exist)".

Note: `meet.spaces.get` on the same space, same token, succeeds and returns the
full config — so the account can read the space but not write to it. This holds
even with a token carrying *only* `meetings.space.settings` (no
`meetings.space.readonly` at all) — that scope alone grants working read access,
confirming the scope itself is functional and the failure is specific to the
write path (`spaces.patch`), not the scope grant in general.

What we've ruled out
---------------------
- Missing scope: confirmed present on the token via tokeninfo for every attempt.
- Stale/cached consent: fully revoked access at myaccount.google.com/permissions
  and re-consented from scratch multiple times; failure persists.
- Stale space: reproduced against multiple brand-new spaces created moments before
  the patch attempt, not just old ones.
- Domain app-trust: Admin Console → Security → API controls → App access control
  shows this OAuth client as "Trusted."
- Scope-combination interference: reproduced identically with a 3-scope token
  (calendar.events, meetings.space.settings, meetings.space.readonly — no Drive
  scope), a bare 2-scope token containing only calendar.events and
  meetings.space.settings (the exact minimal scope set the feature was
  originally built with), and a 5-scope token additionally including
  meetings.space.created (documented for spaces created directly via
  spaces.create, not our Calendar-created case, but tested anyway) — ruling
  out any interaction between meetings.space.settings and every other Meet/
  Drive scope we could plausibly need, individually or combined.
- Caller identity: the account is simultaneously the Calendar event's organizer,
  the OAuth-authorized caller, and (per Meet API docs) should be the space's
  owner — this matches Google's documented requirement that "meeting organizers
  ... can pre-configure auto-recording" for Calendar-created meetings.
- Cloud Console OAuth consent screen scope declaration: discovered
  `calendar.events` and `meetings.space.settings` were not explicitly listed
  under Data Access for this OAuth client; added them there, then fully revoked
  the account's prior grant and re-consented from scratch. Failure persists
  identically with the resulting token.
- Admin Console App access control: this client's entry was already "Trusted."
  Switching it to "Restricted to specific Google data" and adding these exact
  scopes triggered Google's own formal access-request flow (a distinct
  `access_not_configured` block on token refresh, with an admin
  request/approve URL from the OAuth error response). Completed that full
  flow — submitted the request, an admin approved it via "Configure access."
  The resulting fresh token refreshes successfully, carries the correct
  scopes, and successfully creates Calendar events — but `spaces.patch`
  fails with the identical 403 regardless.
- Possibly-related Admin Console display inconsistency: even after completing
  the request/approve flow above, App access control's "Restricted to
  specific Google data" view for this client still shows only the default
  3 sign-in scopes (email, personal info, associate with personal info) —
  none of calendar.events, meetings.space.settings, meetings.space.readonly,
  or drive appear there, despite calendar.events demonstrably working via
  the actual API the entire time. Not confident this is causally related to
  the spaces.patch failure (since calendar.events works despite the same
  display gap), but flagging it as a second observed mismatch between what
  Admin Console displays and what the API actually grants/enforces.
- Domain-wide "Google service access" restriction: set Meet, Calendar, and
  Drive to unrestricted at the domain level (Admin Console → Security → API
  controls → Google service access, or equivalent). Tested with a freshly
  regenerated token afterward (fresh consent, fresh space) — identical 403.

Timeline
--------
- The `spaces.patch` call for `config.accessType` was first added to our
  integration on 2026-08-20, gated behind the `meetings.space.settings` scope,
  which required regenerating the refresh token to take effect.
- It has never succeeded, from that first attempt through today — every token
  regenerated since (multiple full revokes and re-consents, multiple scope
  combinations, both for `accessType` and later for
  `artifactConfig.recordingConfig.autoRecordingGeneration`) has produced the
  identical 403.
- This rules out a specific "something changed and broke it" trigger — it
  appears to have never worked for this account/client, not to have regressed.

Corroborating reports from other developers
---------------------------------------------
This exact error string — "Permission denied on resource Space (or it might not
exist)" — appears in multiple unresolved reports from other developers hitting
Meet API space-modification calls, across different client libraries and even
different auth methods (OAuth2 and service accounts), suggesting this isn't
specific to our setup:
- https://github.com/googleapis/google-cloud-node/discussions/5701 — identical
  error on a service-account-authenticated call; unanswered.
- https://discuss.google.dev/t/code-7-details-permission-denied-on-resource-space-or-it-might-not-exist/159044
  — identical error (code 7) on space creation; no resolution shown.
- https://github.com/googleapis/google-cloud-php/issues/7257 — identical error;
  closed without a documented fix.
- https://github.com/GAM-team/GAM/issues/1822 — not the identical error, but
  notable: GAM's maintainers describe `meetings.space.created` as covering
  "create, modify, and read metadata about meeting spaces created by this app"
  — i.e. scoped to spaces the calling app created directly via spaces.create.
  That's consistent with what we're seeing: our space is created via Calendar's
  conferenceData rather than spaces.create, and adding meetings.space.created
  didn't unblock our spaces.patch call, which would make sense if that scope's
  write coverage never extends to Calendar-created spaces in the first place —
  and if meetings.space.settings doesn't fully cover the write path for them
  either, that leaves no documented scope that does.

Ask
---
Please help identify why `spaces.patch` returns 403 for an account that is the
space's own organizer/owner with the correct scope — reads (`spaces.get`) succeed
against the same space/token, only writes fail. We haven't found anything on our
side (Admin Console app trust, scopes, consent state) that should be blocking
this, so we suspect either an account/domain-specific permission gap not
reflected in the documentation, or a platform-side issue specific to spaces
created via Calendar's `conferenceData.createRequest` rather than the Meet API's
own `spaces.create`.

Happy to provide request/response logs, timestamps, or a live repro session if
useful.
