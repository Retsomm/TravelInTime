import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const GET = async () => {
  await prisma.book.count();
  return NextResponse.json({ ok: true });
};
