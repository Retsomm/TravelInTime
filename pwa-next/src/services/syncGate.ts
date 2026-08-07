// 未登入時完全不會發出雲端同步請求，不是「發出去再讓伺服器用 401 擋掉」。
// 這個開關由 App.tsx（唯一持續掛載、能拿到 Clerk 登入狀態的地方）在 isSignedIn 變動時設定，
// 所有 Service 層（progressService、還在用的 cloudSync.ts）共用同一個開關，避免各自維護一份不同步。
let syncEnabled = false

export const setSyncEnabled = (enabled: boolean) => {
  syncEnabled = enabled
}

export const getSyncEnabled = () => syncEnabled
