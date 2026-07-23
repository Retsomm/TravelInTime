import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const GET = async () => {
  const bookCount = await prisma.book.count();
  return NextResponse.json({ ok: true, bookCount });
};
