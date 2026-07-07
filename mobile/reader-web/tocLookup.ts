import type { TocItem } from '../lib/readerMessages';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const buildToc = (items: any[]): TocItem[] =>
  items.map((item) => ({
    id: (item.href as string) || (item.label as string) || Math.random().toString(36).slice(2),
    href: (item.href as string) ?? '',
    label: (item.label as string)?.trim() ?? '',
    subitems: item.subitems?.length ? buildToc(item.subitems) : undefined,
  }));

export const hrefToSpineIndex = (spineHrefs: string[], href: string): number => {
  const file = href.split('#')[0];
  return spineHrefs.findIndex(
    (h) => h === file || h === href || (Boolean(file) && (h.endsWith(`/${file}`) || file.endsWith(`/${h}`)))
  );
};

// 同檔案完全相符、深度越深（越靠近葉節點）優先，比照網頁版 getChapterTitle。
export const findExactChapterLabel = (tocCache: TocItem[], curFile: string): string => {
  let bestLabel = '';
  let bestDepth = -1;
  const search = (items: TocItem[], depth: number) => {
    for (const item of items) {
      const itemFile = item.href.split('#')[0];
      if (itemFile === curFile && depth > bestDepth) {
        bestLabel = item.label;
        bestDepth = depth;
      }
      if (item.subitems?.length) search(item.subitems, depth + 1);
    }
  };
  search(tocCache, 0);
  return bestLabel;
};

// 找不到精確相符時，退而求其次找 spine 索引最接近（但不超過）目前章節的目錄項目，
// 比照網頁版 getBookmarkLabel 的 fallback 邏輯。
export const findNearestChapterLabel = (tocCache: TocItem[], spineHrefs: string[], curSpineIdx: number): string => {
  let bestLabel = '';
  let bestIdx = -1;
  const search = (items: TocItem[]) => {
    for (const item of items) {
      const si = hrefToSpineIndex(spineHrefs, item.href);
      if (si !== -1 && si <= curSpineIdx && si > bestIdx) {
        bestLabel = item.label;
        bestIdx = si;
      }
      if (item.subitems?.length) search(item.subitems);
    }
  };
  search(tocCache);
  return bestLabel;
};

export const getChapterLabel = (tocCache: TocItem[], spineHrefs: string[], href: string, spineIdx: number): string => {
  const curFile = (href ?? '').split('#')[0];
  return findExactChapterLabel(tocCache, curFile) || findNearestChapterLabel(tocCache, spineHrefs, spineIdx) || '書籤';
};

// 章節目錄的 href 格式常常跟 spine item 的 href 對不上：epub.js 的 Navigation 解析器完全不會
// 正規化 nav/ncx 檔案裡寫的 href（見 node_modules/epubjs/src/navigation.js，沒有傳入 resolver），
// 而 nav.xhtml／toc.ncx 常常跟內容檔案放在不同資料夾，導致目錄裡的 href 是相對於 nav 檔案自己的
// 路徑（例如 `../Text/Section0055.xhtml`），跟 spine.get() 用來比對的 spine item href（相對於
// OPF 解析出來的路徑，例如 `Text/Section0055.xhtml`）對不起來，`rendition.display()` 因此拋出
// `No Section Found`，實測就是「點目錄章節沒反應」的真正根因。網頁版 Reader.tsx 的
// handleNavigateToChapter 已經解過這題：改用檔名比對 spine.items 找出對應項目，拿它「自己的」
// href 去 display()，這裡照抄同一招。CFI（書籤用）本身就是 spine 索引編碼過的字串，不需要這段
// 正規化，用 epubcfi( 開頭這個簡單特徵判斷就好。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const resolveNavTarget = (spineItems: any[], target: string): string => {
  if (/^epubcfi\(/i.test(target)) return target;
  const cleanHref = target.split('#')[0];
  const filename = cleanHref.split('/').pop() ?? '';
  const spineItem = spineItems.find((item) =>
    item.href === target ||
    item.href === cleanHref ||
    item.idref === cleanHref ||
    item.idref === filename ||
    (filename && item.href?.endsWith('/' + filename)) ||
    (filename && item.href === filename)
  );
  if (!spineItem) return target;
  // target 可能帶有目錄錨點（例如 `../Text/Section0055.xhtml#anchor-id`），上面只拿
  // 檔名比對找出 spine item 自己的 href，這裡要把原本的錨點片段接回去，否則章節內的
  // 精確跳轉位置會遺失，只跳到章節開頭。
  const fragment = target.includes('#') ? target.slice(target.indexOf('#')) : '';
  return spineItem.href + fragment;
};
