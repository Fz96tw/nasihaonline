import assert from "node:assert/strict";
import { test } from "node:test";
import { runHealthChecks } from "./health.ts";

const ok = () => Promise.resolve(1);
const SECRET = "postgresql://nasiha:hunter2@postgres:5432/nasiha";
const fail = () => Promise.reject(new Error(`connect ECONNREFUSED ${SECRET}`));
const hang = () => new Promise(() => {});

test("[AC:c64899ce:ac_1] returns 200 with ok:true when Postgres and Redis respond", async () => {
  const result = await runHealthChecks({ db: ok, redis: ok });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, db: "ok", redis: "ok" });
});

test("[AC:c64899ce:ac_2] returns 503 naming Postgres when the database is unreachable", async () => {
  const result = await runHealthChecks({ db: fail, redis: ok });
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { ok: false, db: "down", redis: "ok" });
});

test("[AC:c64899ce:ac_2] returns 503 naming Redis when Redis is unreachable", async () => {
  const result = await runHealthChecks({ db: ok, redis: fail });
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { ok: false, db: "ok", redis: "down" });
});

test("[AC:c64899ce:ac_2] a probe that hangs past the timeout counts as down", async () => {
  const started = Date.now();
  const result = await runHealthChecks({ db: hang, redis: ok }, 50);
  assert.equal(result.status, 503);
  assert.equal(result.body.db, "down");
  assert.ok(Date.now() - started < 1000, "should give up at the timeout, not wait for the probe");
});

test("[AC:c64899ce:ac_2] a probe that throws synchronously counts as down", async () => {
  const result = await runHealthChecks({
    db: () => {
      throw new Error(SECRET);
    },
    redis: ok,
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.db, "down");
});

test("[AC:c64899ce:ac_2] error details never appear in the response body", async () => {
  const result = await runHealthChecks({ db: fail, redis: fail });
  const json = JSON.stringify(result.body);
  assert.ok(!json.includes("hunter2"));
  assert.ok(!json.includes("ECONNREFUSED"));
  assert.deepEqual(Object.keys(result.body).sort(), ["db", "ok", "redis"]);
});
