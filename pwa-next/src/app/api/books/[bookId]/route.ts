import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/requireUserId";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export const PUT = async (request: NextRequest, { params }: RouteContext) => {
  const auth = await requireUserId();
  if (auth.unauthorized) return auth.unauthorized;

  const { bookId } = await params;
  const body = (await request.json()) as { title?: string; author?: string; filename?: string };
  if (!body.title || !body.filename) {
    return NextResponse.json({ error: "title and filename are required" }, { status: 400 });
  }

  const book = await prisma.book.upsert({
    where: { clerkUserId_id: { clerkUserId: auth.userId, id: bookId } },
    create: { id: bookId, clerkUserId: auth.userId, title: body.title, author: body.author ?? "", filename: body.filename },
    update: { title: body.title, author: body.author ?? "", filename: body.filename },
  });
  return NextResponse.json({ book });
};

export const DELETE = async (_request: NextRequest, { params }: RouteContext) => {
  const auth = await requireUserId();
  if (auth.unauthorized) return auth.unauthorized;

  const { bookId } = await params;
  await prisma.book.deleteMany({ where: { clerkUserId: auth.userId, id: bookId } });
  return NextResponse.json({ ok: true });
};
