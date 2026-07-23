import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/requireUserId";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export const GET = async (_request: NextRequest, { params }: RouteContext) => {
  const auth = await requireUserId();
  if (auth.unauthorized) return auth.unauthorized;

  const { bookId } = await params;
  const bookmarks = await prisma.bookmark.findMany({
    where: { clerkUserId: auth.userId, bookId },
    orderBy: { addedAt: "desc" },
  });
  return NextResponse.json({ bookmarks });
};

// 本機優先架構：前端把某本書「目前完整的書籤清單」整包送上來，取代雲端該書的全部書籤。
// 前端的書籤 id 是本機產生的 crypto.randomUUID()，這裡直接沿用同一個 id，
// 讓本機/雲端的書籤 id 保持一致（不需要另外做 id 對應）。
export const PUT = async (request: NextRequest, { params }: RouteContext) => {
  const auth = await requireUserId();
  if (auth.unauthorized) return auth.unauthorized;

  const { bookId } = await params;
  const body = (await request.json()) as {
    bookmarks?: Array<{ id: string; cfi: string; label: string; addedAt: number }>;
  };
  if (!Array.isArray(body.bookmarks)) {
    return NextResponse.json({ error: "bookmarks must be an array" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.bookmark.deleteMany({ where: { bookId, clerkUserId: auth.userId } }),
    prisma.bookmark.createMany({
      data: body.bookmarks.map((b) => ({
        id: b.id,
        bookId,
        clerkUserId: auth.userId,
        cfi: b.cfi,
        label: b.label,
        addedAt: new Date(b.addedAt),
      })),
    }),
  ]);
  return NextResponse.json({ ok: true });
};
