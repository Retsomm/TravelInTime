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
    where: { clerkUserId: auth.userId, bookId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ annotations });
};

// 逐筆 upsert + 軟刪除，取代原本「整包覆蓋」（deleteMany+createMany）的寫法，理由同
// bookmarks/route.ts：整包覆蓋沒有可信的逐筆時間戳也沒有刪除紀錄，沒辦法正確跨裝置合併。
// updatedAt 一樣由前端在編輯當下產生送上來，不用 Prisma 的 @updatedAt 自動管理。
export const PUT = async (request: NextRequest, { params }: RouteContext) => {
  const auth = await requireUserId();
  if (auth.unauthorized) return auth.unauthorized;

  const { bookId } = await params;
  const body = (await request.json()) as {
    upserts?: Array<{
      id: string;
      cfi: string;
      text: string;
      note?: string;
      color?: string;
      chapter?: string;
      createdAt: number;
      updatedAt: number;
    }>;
    deletedIds?: string[];
  };
  if (!Array.isArray(body.upserts) || !Array.isArray(body.deletedIds)) {
    return NextResponse.json({ error: "upserts and deletedIds must be arrays" }, { status: 400 });
  }
  const upserts = body.upserts;
  const deletedIds = body.deletedIds;

  await prisma.$transaction(async (tx) => {
    for (const a of upserts) {
      // 同 bookmarks/route.ts：upsert 的 where 只能用唯一鍵（id），這裡先明確檢查歸屬，
      // 避免惡意送出別人的註記 id 時被拿來竄改別人的資料（防禦性檢查，不影響正常流程）。
      const existing = await tx.annotation.findUnique({ where: { id: a.id }, select: { clerkUserId: true } });
      if (existing && existing.clerkUserId !== auth.userId) continue;
      await tx.annotation.upsert({
        where: { id: a.id },
        create: {
          id: a.id,
          bookId,
          clerkUserId: auth.userId,
          cfi: a.cfi,
          text: a.text,
          note: a.note ?? "",
          color: a.color ?? "",
          chapter: a.chapter ?? "",
          createdAt: new Date(a.createdAt),
          updatedAt: new Date(a.updatedAt),
        },
        update: {
          cfi: a.cfi,
          text: a.text,
          note: a.note ?? "",
          color: a.color ?? "",
          chapter: a.chapter ?? "",
          updatedAt: new Date(a.updatedAt),
          deletedAt: null, // 重新新增一筆先前被軟刪除的同 id 註記時要復活
        },
      });
    }
    if (deletedIds.length > 0) {
      await tx.annotation.updateMany({
        where: { id: { in: deletedIds }, clerkUserId: auth.userId },
        data: { deletedAt: new Date() },
      });
    }
  });
  return NextResponse.json({ ok: true });
};
