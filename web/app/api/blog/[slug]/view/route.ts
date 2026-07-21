import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPublishedPostBySlug, recordPostView } from "@/lib/blog-server";

const VISITOR_COOKIE = "nasiha_vid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * POST /api/blog/[slug]/view — records a unique visit for the eye-icon
 * count (§4.8). Unlike the flag/comment routes, this is unauthenticated-
 * friendly: the blog itself requires no session, so most viewers have
 * none. A signed-in visit dedupes by User.id; a signed-out one dedupes by
 * the nasiha_vid cookie, minted here on first visit.
 */
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const post = await getPublishedPostBySlug(params.slug);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const sessionUser = await getSessionUser();
  const existingVisitorId = request.cookies.get(VISITOR_COOKIE)?.value ?? null;

  let viewerKey: string;
  let visitorId = existingVisitorId;
  if (sessionUser) {
    viewerKey = `user:${sessionUser.id}`;
  } else {
    visitorId = existingVisitorId ?? crypto.randomUUID();
    viewerKey = `anon:${visitorId}`;
  }

  const views = await recordPostView(post.id, viewerKey);

  const response = NextResponse.json({ views });
  if (!sessionUser && !existingVisitorId) {
    response.cookies.set(VISITOR_COOKIE, visitorId!, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: VISITOR_COOKIE_MAX_AGE,
    });
  }

  return response;
}
