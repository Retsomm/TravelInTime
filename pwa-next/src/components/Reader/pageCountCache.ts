import { pageCacheKey } from '@/constants/storageKeys'

// 背景章節頁數掃描（useChapterPageScan.ts）完成一次全書掃描後，把每章真實頁數快取起來，
// 下次開同一本書、字型設定沒變的話直接拿來當初始估計，取代「只用當前這一章的頁數當全書平均」
// 的粗略估計——章節長度差異大時（例如第一章是很短的序章），那個估計會嚴重低估總頁數，
// 要等背景掃描器跑完整本書才會校正回來，讀者體感上就是「頁數一開始亂跳」。
export interface PageCountCache {
  version: number
  fontSize: number
  fontFamily: string
  lineHeight: number
  letterSpacing: number
  chapterPages: Record<number, number>
}

// 早期版本沒有「掃描結果比目前顯示的總頁數還低就不寫入快取」這個防呆，面板開關/縮放視窗
// 觸發的過渡尺寸掃描可能已經把不準確的每章頁數寫進了使用者的 localStorage。這裡用版本號
// 讓那些舊快取直接失效（視同沒有快取，強制重新完整掃描一次），避免一直讀到錯誤資料、
// 錯誤又透過「開書自動灌回快取」機制卡住出不來。之後只要改動 chapterPages 的計算方式或
// 語意，都應該把這個數字往上加一。
const PAGE_COUNT_CACHE_VERSION = 2

export const loadPageCountCache = (bookId: string): PageCountCache | null => {
  try {
    const raw = localStorage.getItem(pageCacheKey(bookId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PageCountCache>
    if (parsed.version !== PAGE_COUNT_CACHE_VERSION) return null
    return parsed as PageCountCache
  } catch {
    return null
  }
}

export const savePageCountCache = (bookId: string, cache: Omit<PageCountCache, 'version'>) => {
  try {
    localStorage.setItem(pageCacheKey(bookId), JSON.stringify({ ...cache, version: PAGE_COUNT_CACHE_VERSION }))
  } catch {
    // localStorage 滿了或不可用時安靜略過，不影響閱讀功能本身
  }
}

// 分頁結果會隨字級/字型/行高/字距改變，只有這四項都跟快取當時完全一致，
// 快取的每章頁數才還準確，任何一項不同就不能用。
export const matchesCurrentSettings = (
  cache: PageCountCache,
  current: { fontSize: number; fontFamily: string; lineHeight: number; letterSpacing: number },
): boolean =>
  cache.fontSize === current.fontSize &&
  cache.fontFamily === current.fontFamily &&
  cache.lineHeight === current.lineHeight &&
  cache.letterSpacing === current.letterSpacing
