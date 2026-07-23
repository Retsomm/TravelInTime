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
  const progress = await prisma.readingProgress.findUnique({
    where: { clerkUserId_bookId: { clerkUserId: auth.userId, bookId } },
  });
  return NextResponse.json({ progress });
};

export const PUT = async (request: NextRequest, { params }: RouteContext) => {
  const auth = await requireUserId();
  if (auth.unauthorized) return auth.unauthorized;

  const { bookId } = await params;
  const body = (await request.json()) as { cfi?: string };
  if (!body.cfi) return NextResponse.json({ error: "cfi is required" }, { status: 400 });

  const progress = await prisma.readingProgress.upsert({
    where: { clerkUserId_bookId: { clerkUserId: auth.userId, bookId } },
    create: { bookId, clerkUserId: auth.userId, cfi: body.cfi },
    update: { cfi: body.cfi },
  });
  return NextResponse.json({ progress });
};
