import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const template = await fs.readFile(path.join(dir, '..', 'build', 'template-swiss.html'), 'utf8');
const slides = await fs.readFile(path.join(dir, 'slides.html'), 'utf8');
const notes = await fs.readFile(path.join(dir, 'notes.js'), 'utf8');

const deckStart = template.indexOf('<div id="deck">');
const navStart = template.indexOf('<div id="nav">', deckStart);
const deckEnd = template.lastIndexOf('</div>', navStart);
if (deckStart < 0 || navStart < 0 || deckEnd < 0) throw new Error('未找到模板中的幻灯片插入区');

let html = template.slice(0, deckStart + '<div id="deck">'.length)
  + '\n' + slides + '\n'
  + template.slice(deckEnd);

const noteStart = html.indexOf('<script>\nconst SPEAKER_NOTES = [');
const noteEnd = html.indexOf('</script>', noteStart);
if (noteStart < 0 || noteEnd < 0) throw new Error('未找到模板中的讲稿备注区');
html = html.slice(0, noteStart) + '<script>\n' + notes + '</script>' + html.slice(noteEnd + '</script>'.length);

html = html.replace('[必填] 替换为 PPT 标题 · Deck Title', '网易MMO策划人才盘点 · 面试汇报');
html = html.replace('--accent:#002FA7;', '--accent:#D12020;');
html = html.replace('--accent-rgb:0,47,167;', '--accent-rgb:209,32,32;');
html = html.replace('--accent-bright:#5B7BFF;', '--accent-bright:#EC6861;');
html = html.replace('<img src="images/03-system-overview.png"', '<img data-image-slot="s16-brief-original-ui" src="images/03-system-overview.png"');
html = html.replace('<img src="images/04-continuous-signal.png"', '<img data-image-slot="s16-brief-original-ui" src="images/04-continuous-signal.png"');
html = html.replace('<img src="images/06-project-matching.png"', '<img data-image-slot="s16-brief-original-ui" src="images/06-project-matching.png"');
html = html.replace('<img src="images/07-diagnostic-report.png"', '<img data-image-slot="s16-brief-original-ui" src="images/07-diagnostic-report.png"');
html = html.replace('<img src="images/05-ai-evidence-audit.png"', '<img data-image-slot="s16-brief-original-ui" src="images/05-ai-evidence-audit.png"');
html = html.replaceAll('<div class="four-cards" style="', '<div class="four-cards" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1.2vw;');
html = html.replace('<div class="canvas-card"><div class="chrome-min"><div class="l">NETEASE SPARK', '<div class="canvas-card"><canvas class="ascii-bg" aria-hidden="true"></canvas><div class="chrome-min" style="position:relative;z-index:2"><div class="l">NETEASE SPARK');
html = html.replace('<div class="half b-accent" data-anim="left" style="justify-content:space-between"><div class="chrome-min">', '<div class="half b-accent" data-anim="left" style="justify-content:space-between;position:relative;overflow:hidden"><canvas class="ascii-bg" aria-hidden="true"></canvas><div class="chrome-min" style="position:relative;z-index:2">');
html = html.replace('</style>', '\n  /* 用户指定网易红：单一强调色；封面与封底不使用图片。 */\n  .slide.accent .canvas-card{background:#D12020}\n  .slide.dark .timeline-h .th-node.accent .yr{color:#ff8c84}\n  #hint{top:1.3vh;bottom:auto;left:50%;right:auto;transform:translateX(-50%);font-size:11px;opacity:.58}\n  body.dark-bg #hint{color:#fff}\n</style>');

if (html.includes('[必填]')) throw new Error('输出仍含必填占位符');
await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');

const editableStyle = `
<style id="editable-mode-style">
  #editToolbar{position:fixed;right:18px;top:18px;z-index:9999;display:flex;gap:8px;align-items:center;padding:9px;background:#171717;border:1px solid #ffffff2f;box-shadow:0 8px 30px #0004;font:13px/1.2 system-ui,-apple-system,"Microsoft YaHei",sans-serif}
  #editToolbar button{border:0;padding:9px 12px;cursor:pointer;background:#fff;color:#171717;font:inherit}
  #editToolbar button.primary{background:#D12020;color:#fff;font-weight:700}
  #editToolbar .edit-tip{color:#ddd;max-width:230px}
  body.editing #deck :is(h1,h2,h3,p,li,[data-edit-text]){outline:1px dashed #D12020;outline-offset:3px;cursor:text}
  body.editing #deck :is(h1,h2,h3,p,li,[data-edit-text]):focus{outline:3px solid #D12020;background:#fff8e8;color:#171717}
  @media print{#editToolbar{display:none!important}}
</style>`;

const editableToolbar = `
<div id="editToolbar" role="region" aria-label="演示文稿文字编辑工具栏">
  <button id="toggleEdit" class="primary" type="button">开始编辑文字</button>
  <button id="exportHtml" type="button">导出当前 HTML</button>
  <span class="edit-tip">点击文字即可修改；完成后请导出保存。</span>
</div>`;

const editableScript = `
<script id="editable-mode-script">
(() => {
  const selector = '#deck h1,#deck h2,#deck h3,#deck p,#deck li,#deck [data-edit-text]';
  const toggle = document.getElementById('toggleEdit');
  const setEditing = (enabled) => {
    document.body.classList.toggle('editing', enabled);
    document.querySelectorAll(selector).forEach((el) => el.setAttribute('contenteditable', enabled ? 'true' : 'false'));
    toggle.textContent = enabled ? '完成编辑' : '开始编辑文字';
  };
  toggle.addEventListener('click', () => setEditing(!document.body.classList.contains('editing')));
  document.getElementById('exportHtml').addEventListener('click', () => {
    setEditing(false);
    const source = '<!doctype html>\\n' + document.documentElement.outerHTML;
    const blob = new Blob([source], {type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '网易MMO策划人才盘点_修改版.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
</script>`;

let editableHtml = html.replace('</head>', editableStyle + '\n</head>');
editableHtml = editableHtml.replace('<div id="deck">', editableToolbar + '\n<div id="deck">');
editableHtml = editableHtml.replace('</body>', editableScript + '\n</body>');
await fs.writeFile(path.join(dir, 'editable.html'), editableHtml, 'utf8');

console.log(`已生成 ${path.join(dir, 'index.html')} 与 editable.html，${(html.match(/data-slide-id=/g) || []).length} 页`);
