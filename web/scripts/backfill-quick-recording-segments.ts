import "dotenv/config";
import { db } from "@/lib/db";

/**
 * One-off backfill for the 3 quick recordings made during the
 * 2026-08-30/31 window when nasihaforyou.org's egress_ended webhook was
 * silently dropped (VPS hairpin-NAT issue, fixed in vps/docker-compose.yml
 * commit 1ea38d8 — the app's DB write for these 3 never ran). Segment data
 * below is read directly from each egress's manifest .json in the
 * livekit-recordings MinIO bucket, matching exactly what the webhook
 * handler (app/api/webhooks/livekit/route.ts) would have written.
 *
 * cmtgfr4go00013jniog5qkjcu's egress produced a manifest but no actual
 * .mp4 ever landed in the bucket (checked directly) — genuinely lost, not
 * just unlinked, so it's marked failed instead of attached.
 *
 * Duplicates attachLiveKitMeetingRequestRecordingSegment/
 * markLiveKitMeetingRequestRecordingSegmentFailed's bodies (lib/meeting-
 * requests-server.ts) instead of importing them — that module starts with
 * `import "server-only"`, which throws under plain tsx (no Next.js
 * server runtime here). Same convention as lib/meeting-recordings-sync.ts.
 */
const segments = [
  {
    roomName: "cmtgfr4go00013jniog5qkjcu",
    egressId: "EG_dsDFBzHFi6yt",
    failed: true as const,
  },
  {
    roomName: "cmtgjmm0u00003cmryjynk69m",
    egressId: "EG_Mg3ABuwrogMM",
    objectKey: "cmtgjmm0u00003cmryjynk69m/2026-08-31T011357-RM_KHyLG8VSB4sZ.mp4",
    startedAtNs: 1788138837677473965n,
    durationSeconds: 31,
    sizeBytes: 6_213_824,
  },
  {
    roomName: "cmtgjtqpv00023cmr0emfvyti",
    egressId: "EG_9ATJeodSYnrT",
    objectKey: "cmtgjtqpv00023cmr0emfvyti/2026-08-31T011748-RM_g6PJ5KTrHUzv.mp4",
    startedAtNs: 1788139068408328331n,
    durationSeconds: 6,
    sizeBytes: 918_197,
  },
];

async function main() {
  for (const s of segments) {
    if (s.failed) {
      const result = await db.meetingRequestRecording.updateMany({
        where: { egressId: s.egressId },
        data: { failedAt: new Date() },
      });
      console.log(`marked failed: egressId=${s.egressId} matched=${result.count > 0}`);
      continue;
    }

    const meetingRequest = await db.meetingRequest.findFirst({
      where: { livekitRoomName: s.roomName },
      select: { id: true },
    });
    if (!meetingRequest) {
      console.log(`attached: egressId=${s.egressId} room=${s.roomName} matched=false`);
      continue;
    }

    await db.meetingRequestRecording.upsert({
      where: { egressId: s.egressId },
      create: {
        meetingRequestId: meetingRequest.id,
        egressId: s.egressId,
        objectKey: s.objectKey,
        startedAt: new Date(Number(s.startedAtNs / 1_000_000n)),
        durationSeconds: s.durationSeconds,
        sizeBytes: s.sizeBytes,
      },
      update: {
        objectKey: s.objectKey,
        startedAt: new Date(Number(s.startedAtNs / 1_000_000n)),
        durationSeconds: s.durationSeconds,
        sizeBytes: s.sizeBytes,
      },
    });
    console.log(`attached: egressId=${s.egressId} room=${s.roomName} matched=true`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
