# nasihaforyou.org demo video

Scripts that record and edit the fast-paced LinkedIn demo video of the live site (4:5, 1080×1350, about 56s). Planwright objective: "LinkedIn demo video of nasihaforyou.org (v6 remake)".

The scripts drive a real browser through production, signed in as the admin account, and blur member names, avatars and inbox text as they record. An editor then turns the recording into the finished video: it speeds up idle stretches, pans and zooms to follow the cursor, animates captions, adds transitions, the title and end cards, and music.

## Files

| File | What it does |
|---|---|
| `tool/common.mjs` | Loads the Clerk keys, admin email and names to blur. Also has the overlay that's injected into each page: name/avatar blur, a fake cursor and click ripples. |
| `tool/record.mjs` | The tour: signed-out landing page with the Upcoming Events carousel, then signing in off camera, the nav tour, dashboard, What's New with the From the Web carousel, library, forums, calendar, the meeting page, members and inbox. Writes frames and a timing log to `raw3/`. |
| `tool/edit.mjs` | Renders `raw3/` into `nasiha-demo-linkedin-$VERSION.mp4`, using `out5/` for intermediate files. |
| `tool/scout.mjs` | Signs in and checks that every selector the tour uses still matches, and screenshots the pages. Run it first after site changes. |
| `tool/scout-public.mjs` | Screenshots the signed-out landing page and events carousel: `node scout-public.mjs <outdir>`. |

To change the tour, edit the `step(...)` blocks in `record.mjs`. Each `caption("…")` starts a new captioned section. Pass `"bottom"` as the second argument when a top caption would cover something, such as the nav bar or a second caption on screen. `camera(rect | "follow" | null)` controls framing, and `speed(0)` hides loading time from the video.

Both carousels pause while hovered, so the tour clicks their Next arrows instead of waiting for auto-advance.

## Setup (none of this is committed — see `.gitignore`)

Run everything from this folder (`marketing/demo-video/`).

1. Install dependencies: `cd tool && npm install`. Playwright's Chromium is expected at `~/.cache/ms-playwright/chromium-1248/`; set `CHROME_PATH` to use another build.
2. Copy the prod Clerk keys from the VPS into `tool/.clerk.env` (chmod 600), and delete the file when you're done:
   ```sh
   ssh ubuntu@50.6.224.185 'grep -E "^(CLERK_SECRET_KEY|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)=" ~/nasiha/.env' \
     | sed 's/^NEXT_PUBLIC_//' > tool/.clerk.env && chmod 600 tool/.clerk.env
   ```
3. Put the admin account's email in `tool/.demo-email` (chmod 600).
4. Put the current member names to blur in `names.txt`, one per line:
   ```sh
   ssh ubuntu@50.6.224.185 "docker exec nasiha-postgres-1 sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -c \"select name from users where name is not null\"'" > names.txt
   ```
5. Add the media inputs:
   - `recs/board.mp4`: the board-meeting recording. The editor uses 4.4s from 596s in; override with `MEET_SS` and `MEET_T`.
   - `overlay/src.mov`: the presenter-overlay demo clip. The shot times are hard-coded in `edit.mjs` (`shots`).
   - `music_in/track.mp3`: the PulseBox dance track from Pixabay, 122 BPM. The splice points are tuned to this track.

## Run

```sh
cd tool
node scout.mjs                  # optional: check selectors still match after site changes
node record.mjs                 # about 2–3 min against production
VERSION=v7 node edit.mjs        # about 3 min; writes ../nasiha-demo-linkedin-v7.mp4
rm -f .clerk.env .demo-email .state.json
```

`edit.mjs` env knobs: `GLOBAL` (overall speed-up, default 1.9), `ZOOM` (follow-cam zoom, default 1.65), plus `MEET_SS`/`MEET_T`. The music loop stretches automatically with the video's length, so the track's breakdown lands on the end card.

## Notes

- The tour hard-codes the board-meeting event ID (`/calendar/4538c4db-…`) and searches the library for "health". Update these if that content moves.
- Uploading to YouTube gets a Content ID claim on the PulseBox track. It's not a strike, and you can dispute it with the Pixabay license.
