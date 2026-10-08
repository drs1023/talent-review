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
html = html.replace('<img src="images/03-system-overview.png"', '<img data-image-slot="s22-hero-21x9" src="images/03-system-overview.png"');
html = html.replace('<img src="images/04-continuous-signal.png"', '<img data-image-slot="s16-brief-original-ui" src="images/04-continuous-signal.png"');
html = html.replace('<img src="images/06-project-matching.png"', '<img data-image-slot="s16-brief-original-ui" src="images/06-project-matching.png"');
html = html.replace('<img src="images/07-diagnostic-report.png"', '<img data-image-slot="s16-brief-original-ui" src="images/07-diagnostic-report.png"');
html = html.replace('<img src="images/05-ai-evidence-audit.png"', '<img data-image-slot="s22-hero-21x9" src="images/05-ai-evidence-audit.png"');
html = html.replaceAll('<div class="four-cards" style="', '<div class="four-cards" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1.2vw;');
html = html.replace('<div class="canvas-card"><div class="chrome-min"><div class="l">NETEASE SPARK', '<div class="canvas-card"><canvas class="ascii-bg" aria-hidden="true"></canvas><div class="chrome-min" style="position:relative;z-index:2"><div class="l">NETEASE SPARK');
html = html.replace('<div class="half b-accent" data-anim="left" style="justify-content:space-between"><div class="chrome-min">', '<div class="half b-accent" data-anim="left" style="justify-content:space-between;position:relative;overflow:hidden"><canvas class="ascii-bg" aria-hidden="true"></canvas><div class="chrome-min" style="position:relative;z-index:2">');
html = html.replace('</style>', '\n  /* 用户指定网易红：单一强调色；封面与封底不使用图片。 */\n  .slide.accent .canvas-card{background:#D12020}\n  .slide.dark .timeline-h .th-node.accent .yr{color:#ff8c84}\n  #hint{top:1.3vh;bottom:auto;left:50%;right:auto;transform:translateX(-50%);font-size:11px;opacity:.58}\n  body.dark-bg #hint{color:#fff}\n</style>');

if (html.includes('[必填]')) throw new Error('输出仍含必填占位符');
await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
console.log(`已生成 ${path.join(dir, 'index.html')}，${(html.match(/data-slide-id=/g) || []).length} 页`);
