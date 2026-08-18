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
    where: { clerkUserId: auth.userId, bookId, deletedAt: null },
    orderBy: { addedAt: "desc" },
  });
  return NextResponse.json({ bookmarks });
};

// 逐筆 upsert + 軟刪除，取代原本「整包覆蓋」（deleteMany+createMany）的寫法：整包覆蓋沒有
// 可信的逐筆時間戳，也沒有刪除紀錄，讀取／還原功能一旦要跨裝置合併就無法分辨「這筆比較新」
// 或「這筆已經在別的裝置被刪除」。前端的書籤 id 是本機產生的 crypto.randomUUID()，
// updatedAt 由前端在編輯當下產生並送上來（不用 Prisma 的 @updatedAt 自動管理，因為那只反映
// 「伺服器收到寫入的時間」，裝置離線一段時間才補推時會失真，變成「晚同步的舊資料看起來比較新」）。
export const PUT = async (request: NextRequest, { params }: RouteContext) => {
  const auth = await requireUserId();
  if (auth.unauthorized) return auth.unauthorized;

  const { bookId } = await params;
  const body = (await request.json()) as {
    upserts?: Array<{ id: string; cfi: string; label: string; addedAt: number; updatedAt: number }>;
    deletedIds?: string[];
  };
  if (!Array.isArray(body.upserts) || !Array.isArray(body.deletedIds)) {
    return NextResponse.json({ error: "upserts and deletedIds must be arrays" }, { status: 400 });
  }
  const upserts = body.upserts;
  const deletedIds = body.deletedIds;

  await prisma.$transaction(async (tx) => {
    for (const b of upserts) {
      // upsert 的 where 只能用唯一鍵（id），沒辦法直接在 where 裡再加 clerkUserId 限制。
      // 這裡先明確檢查歸屬，避免惡意送出別人的書籤 id 時被拿來竄改別人的資料——正常情況下
      // id 是本機 crypto.randomUUID() 產生不會撞到別人，這只是防禦性檢查，不影響正常流程。
      const existing = await tx.bookmark.findUnique({ where: { id: b.id }, select: { clerkUserId: true } });
      if (existing && existing.clerkUserId !== auth.userId) continue;
      await tx.bookmark.upsert({
        where: { id: b.id },
        create: {
          id: b.id,
          bookId,
          clerkUserId: auth.userId,
          cfi: b.cfi,
          label: b.label,
          addedAt: new Date(b.addedAt),
          updatedAt: new Date(b.updatedAt),
        },
        update: {
          cfi: b.cfi,
          label: b.label,
          updatedAt: new Date(b.updatedAt),
          deletedAt: null, // 重新新增一筆先前被軟刪除的同 id 書籤時要復活
        },
      });
    }
    if (deletedIds.length > 0) {
      await tx.bookmark.updateMany({
        where: { id: { in: deletedIds }, clerkUserId: auth.userId },
        data: { deletedAt: new Date() },
      });
    }
  });
  return NextResponse.json({ ok: true });
};
