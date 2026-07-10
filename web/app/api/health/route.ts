import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

export async function GET() {
  const [dbOk, redisOk] = await Promise.all([
    db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping().then(() => true).catch(() => false),
  ]);

  return NextResponse.json({ db: dbOk, redis: redisOk });
}
