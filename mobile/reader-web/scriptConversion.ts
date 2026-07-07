import * as OpenCC from 'opencc-js';
import type { Script } from '../lib/readerSettings';
import { invalidateTextIndex } from './ttsHighlight';

// 比照 renderer/src/components/Reader/scriptConversion.ts：opencc-js 轉換器延遲建立，
// originalTexts 記住轉換前的原始文字，切回原始 script 時可以還原（不必重新解析文件）。
let toSC: ((s: string) => string) | null = null;
let toTC: ((s: string) => string) | null = null;
const getToSC = () => {
  if (!toSC) toSC = OpenCC.Converter({ from: 'tw', to: 'cn' });
  return toSC;
};
const getToTC = () => {
  if (!toTC) toTC = OpenCC.Converter({ from: 'cn', to: 'tw' });
  return toTC;
};
const originalTexts = new WeakMap<Node, string>();

const convertDoc = (doc: Document, convert: (s: string) => string) => {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && !originalTexts.has(node)) {
      originalTexts.set(node, node.nodeValue);
      node.nodeValue = convert(node.nodeValue);
    }
  }
};

const restoreDoc = (doc: Document) => {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const original = originalTexts.get(node);
    if (original !== undefined) {
      node.nodeValue = original;
      originalTexts.delete(node);
    }
  }
};

// 只有「顯示腳本」跟「書本原始腳本」不同時才需要轉換；相同就還原成書本原文，
// 比照網頁版 Reader.tsx 的 `if (scriptRef.current !== baseScriptRef.current)` 判斷。
export const applyScriptToDoc = (doc: Document, script: Script, baseScript: Script) => {
  if (!doc.body) return;
  if (script === baseScript) {
    restoreDoc(doc);
  } else {
    convertDoc(doc, script === 'sc' ? getToSC() : getToTC());
  }
  invalidateTextIndex(doc);
};
