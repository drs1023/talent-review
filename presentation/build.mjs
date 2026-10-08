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
html = html.replace('</style>', '\n  /* 用户指定网易红：单一强调色；封面与封底不使用图片。 */\n  .slide.accent .canvas-card{background:#D12020}\n  .slide.dark .timeline-h .th-node.accent .yr{color:#ff8c84}\n  #hint{top:1.3vh;bottom:auto;left:50%;right:auto;transform:translateX(-50%);font-size:11px;opacity:.58}\n  body.dark-bg #hint{color:#fff}\n</style>');

if (html.includes('[必填]')) throw new Error('输出仍含必填占位符');
await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
console.log(`已生成 ${path.join(dir, 'index.html')}，${(html.match(/data-slide-id=/g) || []).length} 页`);
