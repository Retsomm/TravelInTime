const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const entry = path.join(__dirname, '../reader-web/index.ts');
const outFile = path.join(__dirname, '../lib/readerHtml.generated.ts');

async function build() {
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    target: 'es2018',
    write: false,
    minify: true,
  });

  const bundleJs = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #f9f7f2; }
  #container { position: relative; width: 100%; height: 100%; }
  #viewer { width: 100%; height: 100%; }
  /* epub.js 的 .epub-container 預設是 justify-content: center 的 flex 容器，若 rendition 建立當下量到的
     寬高跟畫面實際尺寸有落差，會把內容置中造成翻頁區域的座標計算跟畫面實際觸控座標對不齊
     （Electron 版 renderer/src/page/Reader.tsx 也踩過同一顆坑，用同一招修）。 */
  .epub-container { justify-content: flex-start !important; }
  /* 點擊翻頁區：蓋在 #viewer 最上層的透明區塊，用最外層文件（非 epub.js 內容 iframe）的座標系，
     不會受 iframe 內部分頁座標系失準的問題影響（見 index.ts 內的說明）。中間留白給文字選取／未來註記手勢用。 */
  .tap-zone { position: absolute; top: 0; height: 100%; width: 33.34%; z-index: 10; }
  #tap-zone-prev { left: 0; }
  #tap-zone-next { right: 0; }
</style>
</head>
<body>
<div id="container">
  <div id="viewer"></div>
  <div id="tap-zone-prev" class="tap-zone"></div>
  <div id="tap-zone-next" class="tap-zone"></div>
</div>
<script>${bundleJs}</script>
</body>
</html>`;

  const ts = `// 此檔案由 \`yarn build:reader\`（scripts/build-reader-html.js）自動產生，請勿手動編輯。
// 原始碼位於 mobile/reader-web/index.ts。
export const READER_HTML = ${JSON.stringify(html)};
`;

  fs.writeFileSync(outFile, ts);
  console.log(`[build-reader-html] 已輸出 ${path.relative(process.cwd(), outFile)}（${(bundleJs.length / 1024).toFixed(1)} KB JS）`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
