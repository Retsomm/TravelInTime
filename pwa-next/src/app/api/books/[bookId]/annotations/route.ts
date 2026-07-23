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
  const annotations = await prisma.annotation.findMany({
    where: { clerkUserId: auth.userId, bookId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ annotations });
};

// 本機優先架構：前端把某本書「目前完整的註記清單」整包送上來，取代雲端該書的全部註記
// （新增、改顏色、改筆記、刪除都會經過這裡，因為前端本來就是整包 state 存 localStorage）。
// 前端的註記 id 是本機產生的 crypto.randomUUID()，這裡直接沿用同一個 id。
export const PUT = async (request: NextRequest, { params }: RouteContext) => {
  const auth = await requireUserId();
  if (auth.unauthorized) return auth.unauthorized;

  const { bookId } = await params;
  const body = (await request.json()) as {
    annotations?: Array<{
      id: string;
      cfi: string;
      text: string;
      note?: string;
      color?: string;
      chapter?: string;
      createdAt: number;
    }>;
  };
  if (!Array.isArray(body.annotations)) {
    return NextResponse.json({ error: "annotations must be an array" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.annotation.deleteMany({ where: { bookId, clerkUserId: auth.userId } }),
    prisma.annotation.createMany({
      data: body.annotations.map((a) => ({
        id: a.id,
        bookId,
        clerkUserId: auth.userId,
        cfi: a.cfi,
        text: a.text,
        note: a.note ?? "",
        color: a.color ?? "",
        chapter: a.chapter ?? "",
        createdAt: new Date(a.createdAt),
      })),
    }),
  ]);
  return NextResponse.json({ ok: true });
};
