import { clerkMiddleware } from "@clerk/nextjs/server";

// 書庫瀏覽/閱讀是完全本機的功能（IndexedDB/localStorage），不需要登入，頁面路由一律公開。
// 雲端同步的 API route（/api/books、/api/me 等）各自在 handler 裡用 requireUserId() 明確檢查，
// 不在這裡用 auth.protect() 統一擋——JSON API 被 protect() 導去 Clerk 登入頁的 redirect
// 行為對 fetch() 呼叫端不友善，直接回 401 JSON 讓前端好處理。
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
