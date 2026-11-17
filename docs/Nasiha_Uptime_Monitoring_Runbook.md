# Nasiha Uptime Monitoring Runbook

How production (`nasihaforyou.org`, the Bluehost VPS) is watched for outages,
and what to do when an alert fires. For recovering from data loss, see the
[Backup & Restore Runbook](Nasiha_Backup_and_Restore_Runbook.md).

## Why an external monitor

The monitor must run **outside** the VPS and outside the homelab:

- Prometheus/Grafana on the VPS can't send an alert when the VPS itself, or
  its network, is down.
- The homelab shares the operator's home AT&T line. On 2026-11-17
  (02:17–02:46 UTC) the site looked down from home, so it was redeployed.
  The VPS logs later showed it had been healthy the whole time: other
  visitors were served, and the operator's requests simply never arrived. A
  monitor on that line would have raised the same false alarm.

## What is monitored

Set up in **UptimeRobot** (free plan, uptimerobot.com), signed in with the
operator's account. Every monitor checks from several regions and only alerts
once more than one region confirms the failure.

| Monitor | Type | Target | Down when |
|---|---|---|---|
| Nasiha health | HTTP(s) | `https://nasihaforyou.org/api/health` | not 200 (Postgres or Redis down, app down, proxy down, TLS broken) |
| Nasiha homepage | Keyword | `https://nasihaforyou.org/`, keyword `NASIHA` must exist | keyword missing (e.g. an error page served with 200) |
| LiveKit | HTTP(s) | `https://livekit.nasihaforyou.org/` | not 2xx (meetings/recording unavailable) |
| Showup | Keyword | `https://showup.cloudcurio.com/api/health`, keyword `"status":"ok"` must exist | keyword missing. Showup's health always answers 200 and reports `"degraded"` in the body, so a plain HTTP check would never fire for a dependency outage |

- **Interval:** 5 minutes (the free-plan minimum).
- **Alert contacts:** the operator's email, plus push notifications from the
  UptimeRobot mobile app. Push usually arrives first.
- **Alerting:** UptimeRobot re-checks from other regions before marking a
  monitor down. Leave that on, since it's what filters out single-location
  blips. Leave "notify when back up" on too.

### `/api/health` contract

Code: `web/app/api/health/route.ts` and `web/lib/health.ts`.

- `200 {"ok":true,"db":"ok","redis":"ok"}`: Postgres (`SELECT 1`) and Redis
  (`PING`) both answered within 2s.
- `503 {"ok":false,"db":"down","redis":"ok"}` (or `redis:"down"`): which
  dependency failed. Error details are never included.
- It's public (no Clerk session needed), sends `Cache-Control: no-store`, and
  isn't rate-limited.
- Also used by `scripts/deploy-vps.sh` step 8 (the deploy fails if it isn't
  200) and by the `app` service healthcheck in `vps/docker-compose.yml`, so
  `docker ps` shows `(unhealthy)` when it fails.

### Setting it up again

1. Sign in at uptimerobot.com and go to **+ New monitor**.
2. Create each row from the table above (for the homepage, choose type
   **Keyword**, keyword `NASIHA`, alert when **keyword not exists**).
3. Under each monitor's **Notifications**, tick the email contact and the
   mobile-app contact. Install the UptimeRobot app and sign in so it
   registers as a contact.
4. Check it works: the health monitor should go green within one interval.
   Use **Pause/Resume** or a test notification to confirm alerts arrive.

## When an alert fires

Work through these in order. Don't redeploy until step 3 says the server is
actually the problem.

1. **Is it really down?** Open the UptimeRobot dashboard. If several regions
   report it down, it's real. Then load the site on your phone **on cellular
   data** (Wi-Fi off). If it loads there but not at home, the problem is your
   network, not the VPS. Stop here.
2. **Which part?** `curl -s https://nasihaforyou.org/api/health`
   - `503` with `db:"down"` or `redis:"down"`: go to step 4.
   - Timeout or connection refused: the app, the proxy or the host is down.
     Go to step 3.
   - Only LiveKit or Showup is down: check that container in step 3.
3. **Look at the box** (`ssh ubuntu@50.6.224.185`):
   - `uptime` and `who -b`: did the host reboot? (Bluehost maintenance, a
     kernel panic.)
   - `docker ps`: is anything missing, restarting or `(unhealthy)`? Look at
     the `nasiha-app-1` STATUS and CREATED columns.
   - `docker logs --tail 100 nasiha-app-1` and `docker logs nginx_proxy_manager`.
   - `free -h`, `df -h /`, and `sudo journalctl -k --since -2h | grep -i oom`.
     The VPS has no swap, so memory pressure kills processes.
   - Proxy logs: `docker exec nginx_proxy_manager sh -c 'tail -50
     /data/logs/proxy-host-4_error.log'` (proxy host 4 is the apex
     `nasihaforyou.org`) for upstream timeouts or connect() failures.
4. **Dependency down:** `docker ps` for `nasiha-postgres-1` / `nasiha-redis-1`,
   then `docker logs` on the failing one. Fix that container first: the app
   will recover by itself once the dependency is back.
5. **Restart the narrowest thing that's broken.** Run `cd ~/nasiha && docker
   compose restart app` (or the failing service). Note that a redeploy with
   an unchanged image does **not** restart running containers, because
   `docker compose up -d` leaves them alone, so it's not a restart button.
   Use `scripts/deploy-vps.sh` only to ship new code.
6. **Afterwards:** note what happened and the time window (UTC). If it's
   recurring, add it to the Production Resilience initiative.

### Harmless log noise

`Clerk: unable to resolve handshake: JWT is expired …` and `Clock skew
detected` in the app logs mean a browser came back with a Clerk session
cookie that had expired days earlier. Clerk treats it as signed out. The
VPS clock is NTP-synced. `deploy-vps.sh` greps recent app logs for "rror",
so these lines often show up in deploy output. They don't mean the deploy
failed.
