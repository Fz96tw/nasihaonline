# LiveKit Load Test — VPS capacity (2026-11-14)

How many people a single Nasiha Conference meeting can hold on the self-hosted LiveKit instance on the production VPS (see `Nasiha_LiveKit_Hosting_Decision.md`).

**Bottom line:** a 20-person meeting with everyone on camera is comfortable, with or without a recording running. The server stayed mostly idle. Outbound bandwidth will run out before CPU does.

## Environment

- **VPS:** Bluehost, 4 vCPU (AMD EPYC), 8 GB RAM, "unmetered" bandwidth (actual port speed unknown)
- **Server:** `livekit-server` + `livekit-egress` containers from `vps/docker-compose.yml`, shared with the app, Postgres, MinIO, Meilisearch, etc.
- **Client config in the app** (`web/components/calendar/livekit-meeting-screen.tsx`): webcam capped at 480p / 20 fps / 600 kbps, plus one 180p simulcast layer
- **Recording config in the app** (`web/lib/livekit-egress.ts`): room composite, grid layout, 1280×720, 20 fps, 2000 kbps
- **Load generator:** `lk` CLI 2.19.4 (`lk load-test`), run from the homelab/WSL machine over the public `wss://livekit.nasihaforyou.org` endpoint
- **Metrics:** VPS Prometheus (LiveKit `:6789` + node-exporter) and `docker stats`

## Baseline before the test

The largest real meeting in the ~15 days of Prometheus history (2026-11-03) had 6 people, with 3 audio and 2 video tracks. LiveKit used about 0.07 cores and the whole host about 5% CPU, with a peak of about 12–20 Mbps outbound. This was too light to show where the limit is.

## Test method

```bash
lk load-test --room <name> \
  --video-publishers 20 --subscribers 20 \
  --layout 5x5 --video-resolution medium --duration 3m
```

- **Video:** each simulated publisher sends a pre-encoded sample video in a loop, with simulcast on. To the SFU this looks like a live webcam: real encoded video that has to be forwarded to every subscriber.
- **No audio:** no audio publishers were added. Audio is about 30–50 kbps per person, which is minor compared with video.
- **Separate publishers and subscribers:** the 20 publishers and 20 subscribers are separate participants, so the room showed 40. That gives 20 × 20 = 400 forwarded video streams, close to a real 20-person meeting where everyone both sends and receives (20 × 19 = 380).
- **5×5 layout:** subscribers request small-tile quality (about 120–220 kbps per stream), like attendees in gallery view.
- **Round 2:** a room-composite recording was started on the room about 40 seconds in and stopped after about 2 minutes. It used the same layout and encoding as the app, writing to a local file in the egress container. The file was then deleted.

A 30-second pilot with 5 publishers and 5 subscribers ran first: all 25 streams arrived with 0% loss.

## Results

| | Round 1: 20 on camera, no recording | Round 2: 20 on camera + recording |
|---|---|---|
| Streams delivered | 400/400 | 400/400 |
| Subscriber packet loss | 0.004% (64 packets) | 0.002% (35 packets) |
| Per-subscriber receive bitrate | about 3.2 Mbps | about 3.2 Mbps |
| LiveKit CPU | about 0.22 cores | about 0.25–0.34 cores |
| Egress (recorder) CPU | — | about 1.1 cores (peak 1.5) |
| Whole-host CPU (4 vCPU) | about 9% | about 37% |
| VPS outbound (ens3) | about 68 Mbps | about 68 Mbps |
| VPS inbound (ens3) | about 4.5 Mbps | — |
| LiveKit memory | about 350 MB | about 360 MB |
| Egress memory | — | about 640 MB |

The recording completed (`EGRESS_COMPLETE`) and produced a 31 MB MP4 for about 2 minutes.

## Extrapolation (rough)

SFU work scales with forwarded streams, which is about (people on camera) × (viewers), roughly N².

| People, all on camera | Forwarded streams | LiveKit CPU (est.) | Outbound (est.) |
|---|---|---|---|
| 20 (measured) | about 400 | 0.22 cores | about 68 Mbps |
| 30 | about 900 | about 0.5 cores | about 150 Mbps |
| 50 | about 2,500 | about 1.4 cores | about 400 Mbps |

- **Bandwidth limits first.** On a 1 Gbps port, about 50+ people on camera is plausible. On a 100 Mbps port, about 25–30. The VPS's real port speed should be confirmed with Bluehost.
- **CPU is not the limit until well past 50 people**, even with one recording running (about 1–1.5 cores).
- **Fewer cameras raise the limit a lot.** 30 people with 8 cameras on is much lighter than 20 with all cameras on.

## Caveats

- **Simulated clients.** Real browsers add RTCP/feedback and adaptive-stream overhead. Treat the estimates as optimistic by up to about 2x; there is still plenty of headroom at 20.
- **Video quality.** The `medium` setting is probably somewhat below the app's 480p webcam cap; this wasn't checked. There was also no audio. A worst-case re-run would use `--video-resolution high` plus `--audio-publishers 20`.
- **Single source network.** All test traffic came from one home connection, not 20 separate networks, so real-world last-mile issues weren't exercised.
- **Attendee devices weren't tested.** At 20+ people, an attendee's older laptop or phone decoding about 19 videos is more likely to struggle than the server.
- **One recording at a time.** Two simultaneous recordings would need about 2–3 cores for egress alone on this 4 vCPU host.

## Recommendations

- For the first real 20+ person meeting, watch the Grafana "LiveKit SFU" and "VPS host" dashboards (SSH tunnel to `127.0.0.1:3001` on the VPS; locally 3001 is taken by `planwright_mcp`, so map it to another port).
- Encourage cameras off when not speaking in large meetings.
- Confirm the VPS port speed with Bluehost, since it sets the real ceiling.
- Re-run this test after any change to the client video presets, the recording encoding, or the VPS size.
