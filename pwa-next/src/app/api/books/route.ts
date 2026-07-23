import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/requireUserId";

export const GET = async () => {
  const auth = await requireUserId();
  if (auth.unauthorized) return auth.unauthorized;

  const books = await prisma.book.findMany({
    where: { clerkUserId: auth.userId },
    include: { progress: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ books });
};
