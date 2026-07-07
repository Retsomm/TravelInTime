import { EpubCFI } from 'epubjs';
import type { Rendition } from 'epubjs';
import type { AnnotationMark, OutboundMessage } from '../lib/readerMessages';

export interface AnnotationDiff {
  toRemove: AnnotationMark[];
  toAdd: AnnotationMark[];
}

// 比對「目前畫面上已渲染」跟「應該顯示」的兩份標記清單：清單裡消失的 id 移除標記、
// 新出現的 id 新增標記、顏色或 cfi 變了的先移除再重新加上（epub.js 的 annotations.add
// 沒有提供改色 API，只能整個換掉）。純函數，抽出自原本 applyAnnotations 內的差異比對邏輯。
export const diffAnnotations = (rendered: Map<string, AnnotationMark>, list: AnnotationMark[]): AnnotationDiff => {
  const nextIds = new Set(list.map((a) => a.id));
  const toRemove: AnnotationMark[] = [];
  rendered.forEach((prev, id) => {
    if (!nextIds.has(id)) toRemove.push(prev);
  });
  const toAdd: AnnotationMark[] = [];
  list.forEach((ann) => {
    const prev = rendered.get(ann.id);
    if (!prev) {
      toAdd.push(ann);
    } else if (prev.color !== ann.color || prev.cfi !== ann.cfi) {
      toRemove.push(prev);
      toAdd.push(ann);
    }
  });
  return { toRemove, toAdd };
};

type Post = (msg: OutboundMessage) => void;
type DebugLog = (...args: unknown[]) => void;

// 比照網頁版 Reader.tsx 的 addEpubAnnotation：epub.js 的 Annotations 類別是在
// `rendition.hooks.render.register(this.inject.bind(this))` 掛上去的（見
// node_modules/epubjs/src/annotations.js），而 hooks.render 有時候會比 iframe 的 contents
// （真正的 document/尺寸）就緒得早，導致 marks-pane 拿到的量測基準還沒準備好，SVG 標記
// 因此可能「呼叫沒有拋例外，但畫面上什麼都沒畫出來」。這裡照抄網頁版的保險機制：呼叫完成
// 後延遲檢查 DOM 裡有沒有真的生出這個標記的元素，沒有就強制 clear()+inject() 重新掛一次，
// 順便加 log 記錄 SVG 標記實際的量測結果，方便判斷是「完全沒生成標記元素」還是「元素生成
// 了但位置/尺寸算錯變成看不到」兩種不同情況。
const logMarkGeometry = (debugLog: DebugLog, id: string, label: string) => {
  const markEl = document.querySelector(`.ann-${id}`);
  if (!markEl) {
    debugLog(`[markGeometry:${label}]`, id, '在最外層 document 找不到 .ann-<id> 元素');
    return;
  }
  const svg = markEl.closest('svg');
  const markRect = markEl.getBoundingClientRect();
  const svgRect = svg?.getBoundingClientRect();
  const iframe = document.querySelector('#viewer iframe') as HTMLIFrameElement | null;
  const iframeRect = iframe?.getBoundingClientRect();
  debugLog(
    `[markGeometry:${label}]`, id,
    'mark=', { w: Math.round(markRect.width), h: Math.round(markRect.height), x: Math.round(markRect.x), y: Math.round(markRect.y) },
    'svg=', svgRect ? { w: Math.round(svgRect.width), h: Math.round(svgRect.height) } : 'no-svg',
    'iframe=', iframeRect ? { w: Math.round(iframeRect.width), h: Math.round(iframeRect.height), x: Math.round(iframeRect.x), y: Math.round(iframeRect.y) } : 'no-iframe',
    'iframeScroll=', { w: iframe?.contentWindow?.innerWidth, scrollW: iframe?.contentDocument?.documentElement?.scrollWidth }
  );
};

// 強制重新掛所有目前的 annotation（clear + inject），共用給「新增標記後檢查」跟「每次新內容
// 渲染後檢查」兩個呼叫點。
export const reinjectAllAnnotations = (rendition: Rendition | null, debugLog: DebugLog, label: string) => {
  if (!rendition) return;
  debugLog('[reinjectAllAnnotations]', label);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annApi = rendition.annotations as any;
  rendition.views().forEach((view: unknown) => {
    annApi.clear(view);
    annApi.inject(view);
  });
};

// 檢查目前應該顯示的標記，DOM 裡是不是真的都有對應的 <line> 元素；缺漏就整批強制重掛一次。
// renderedAnnotations 是整本書的標記清單，但畫面上（DOM）任何時刻只會有目前顯示中章節的
// 標記被實際掛出來——只比對「目前可見章節」涵蓋到的標記，避免把其他章節本來就不該出現在
// DOM 裡的標記誤判成「缺漏」，觸發不必要的 reinjectAllAnnotations。
export const verifyAnnotationsRendered = (
  rendition: Rendition | null,
  debugLog: DebugLog,
  renderedAnnotations: Map<string, AnnotationMark>,
  label: string
) => {
  if (renderedAnnotations.size === 0 || !rendition) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents = ((rendition as any).getContents?.() ?? []) as { sectionIndex: number }[];
  const visibleSections = new Set(contents.map((c) => c.sectionIndex));
  if (visibleSections.size === 0) return;
  const expected = [...renderedAnnotations.values()].filter((ann) => {
    try {
      return visibleSections.has(new EpubCFI(ann.cfi).spinePos);
    } catch {
      return false;
    }
  });
  if (expected.length === 0) return;
  const missing = expected.filter((ann) => !document.querySelector(`.ann-${ann.id} line`));
  debugLog('[verifyAnnotationsRendered]', label, '目前章節應顯示', expected.length, '筆，缺少', missing.length, '筆', missing.map((a) => a.id));
  if (missing.length > 0) reinjectAllAnnotations(rendition, debugLog, `verify:${label}`);
};

// 劃線註記：用 epub.js 內建的 annotations API（'underline' 型別，SVG 標記，不修改 DOM 文字節點）。
export const addAnnotationMark = (rendition: Rendition | null, post: Post, debugLog: DebugLog, ann: AnnotationMark): boolean => {
  if (!rendition) {
    debugLog('[addAnnotationMark] 略過：rendition 尚未就緒', ann.id);
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (rendition.annotations as any).underline(
      ann.cfi,
      {},
      () => {
        debugLog('[annotationTapped]', ann.id);
        post({ type: 'annotationTapped', id: ann.id });
      },
      `ann-${ann.id}`,
      { stroke: ann.color, 'stroke-opacity': '1', 'stroke-width': '3', fill: 'none' }
    );
    debugLog('[addAnnotationMark] underline() 呼叫完成', ann.id, 'cfi=', ann.cfi.slice(0, 40), 'result=', result ? 'ok' : 'undefined/null');
    logMarkGeometry(debugLog, ann.id, 'immediately-after-call');
    setTimeout(() => {
      logMarkGeometry(debugLog, ann.id, '300ms-later');
      const line = document.querySelector(`.ann-${ann.id} line`);
      if (!line) {
        debugLog('[addAnnotationMark] 300ms 後仍找不到 <line> 元素，強制 clear+inject 重新掛一次', ann.id);
        reinjectAllAnnotations(rendition, debugLog, `create:${ann.id}`);
        setTimeout(() => logMarkGeometry(debugLog, ann.id, 'after-reinject'), 100);
      }
    }, 300);
    return true;
  } catch (err) {
    debugLog('[addAnnotationMark] underline() 拋出例外', ann.id, err instanceof Error ? err.message : String(err));
    return false;
  }
};

export const removeAnnotationMark = (rendition: Rendition | null, debugLog: DebugLog, ann: AnnotationMark) => {
  if (!rendition) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rendition.annotations as any).remove(ann.cfi, 'underline');
    debugLog('[removeAnnotationMark] 已移除', ann.id);
  } catch (err) {
    debugLog('[removeAnnotationMark] 拋出例外', ann.id, err instanceof Error ? err.message : String(err));
  }
};
