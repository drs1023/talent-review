import { createDemoState, dimensions, roleProfiles } from './data.js';
import { readMeetingFile, localExtractSignals, normaliseAiSignals } from './meeting.js';
import { callDeepSeek, parseJsonObject } from './ai.js';

const STORE = 'mmo-talent-compass-v1';
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
let deepseekKey = '';
let aiText = '';
let evidenceAudit = {personId:'',status:'等待运行',model:'deepseek-flash',result:null};
let state;
try { state = JSON.parse(localStorage.getItem(STORE)) || createDemoState(); } catch { state = createDemoState(); }
let view = 'overview';
let teamTab = 'coverage';
let matchRole = state.config.targetRole;
let matchStage = state.config.stage;
let selectedCandidate = null;
let filterRole = '全部岗位';
let filterQuery = '';
let toastTimer;
let meetingImport={fileName:'',text:'',personId:state.selectedPersonId||state.people[0]?.id||'',candidates:[],status:'等待上传会议纪要',model:'deepseek-flash',mode:'local'};

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const today = () => new Date().toISOString().slice(0,10);
const age = date => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
const fmt = date => date ? new Date(date + 'T00:00:00').toLocaleDateString('zh-CN',{month:'short',day:'numeric'}) : '—';
const persist = () => { state.updatedAt = new Date().toISOString(); localStorage.setItem(STORE, JSON.stringify(state)); };
const person = id => state.people.find(p => p.id === id);
const evFor = id => state.evidence.filter(e => e.personId === id).sort((a,b) => b.date.localeCompare(a.date));
const confirmed = e => e.status !== '待确认';
const scoreAvg = p => dimensions.reduce((sum,d) => sum + num(p.scores?.[d.id]),0) / dimensions.length;
const evidenceHealth = p => {
  const ev = evFor(p.id), recent = ev.filter(e => age(e.date) <= 90), verified = ev.filter(confirmed);
  if (!ev.length) return {label:'待补证据',tone:'red',value:0,latest:null};
  const value = Math.min(100, Math.round(recent.length * 26 + verified.length * 20 + new Set(ev.map(e=>e.dimension)).size * 8));
  return {label:value>=65?'较充分':value>=30?'需补充':'证据偏弱',tone:value>=65?'':'amber',value,latest:ev[0]?.date};
};
const roleWeights = (role, stage) => {
  const base = {...roleProfiles[role]};
  if (!base) return {...roleProfiles['系统/数值']};
  if (stage === '孵化探索') { base.exploration += 15; base.complexity += 5; base.delivery -= 10; base.craft -= 5; base.collaboration -= 5; }
  if (stage === '上线运营') { base.player += 8; base.delivery += 7; base.exploration -= 10; base.complexity -= 5; }
  return base;
};
const match = (p, role=matchRole, stage=matchStage) => {
  const weights = role === state.config.targetRole && stage === state.config.stage ? state.config.weights : roleWeights(role, stage);
  const sum = dimensions.reduce((v,d) => v + num(p.scores?.[d.id]) * num(weights[d.id]),0);
  const total = dimensions.reduce((v,d) => v + num(weights[d.id]),0) || 100;
  const ability = Math.round(25 + sum / (4 * total) * 60);
  const roleAdjustment = p.role === role ? 6 : -7;
  const interestAdjustment = p.mobility === '愿意探索' ? 5 : p.mobility === '暂不流动' ? -18 : p.mobility === '需沟通' ? -5 : 0;
  const score = Math.max(0, Math.min(95, ability + roleAdjustment + interestAdjustment));
  const ev = evidenceHealth(p);
  const strongest = [...dimensions].sort((a,b) => num(p.scores[b.id])*num(weights[b.id]) - num(p.scores[a.id])*num(weights[a.id]))[0];
  const gaps = dimensions.filter(d => num(weights[d.id]) >= 15 && num(p.scores[d.id]) < 3).map(d=>d.name);
  return {score, evidence:ev, strongest:strongest.name, gaps, roleFit:p.role===role, mobility:p.mobility};
};
const pill = (text,tone='') => `<span class="pill ${tone}">${esc(text)}</span>`;
const btn = (text,action,cls='ghost') => `<button class="button ${cls}" data-action="${esc(action)}">${esc(text)}</button>`;
const bar = (value,color='') => `<div class="bar-track ${color}"><span style="width:${Math.max(0,Math.min(100,num(value)))}%"></span></div>`;
const options = (list,current) => list.map(x=>`<option value="${esc(x)}" ${x===current?'selected':''}>${esc(x)}</option>`).join('');
const titles = {
  overview:['决策总览','从半年一盘，走向随项目节奏更新的人才决策。'],
  people:['人才画像','岗位能力、项目经历与发展意愿，放在同一张可追溯的档案里。'],
  signals:['连续信号','在关键事件留下轻量证据，由主管确认，再进入人才判断。'],
  matching:['新项目组队','围绕目标岗位与项目阶段，看人选、证据和对老项目的影响。'],
  report:['诊断报告','将盘点结果翻译成业务可讨论、可执行的行动。'],
  settings:['画像配置与导入','调整岗位情境、导入数据，检查盘点依据是否完整。']
};
function setView(next) {
  view=next;
  document.querySelector('#pageTitle').textContent=titles[next][0];
  document.querySelector('#pageSubtitle').textContent=titles[next][1];
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===next));
  render(); window.scrollTo({top:0,behavior:'smooth'});
}
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
function showModal(html){document.querySelector('#modalContent').innerHTML=html;modal.showModal();}
function closeModal(){modal.close();}

function renderOverview(){
  const unconfirmed=state.evidence.filter(e=>!confirmed(e));
  const stale=state.people.filter(p=>!evidenceHealth(p).latest || age(evidenceHealth(p).latest)>90);
  const keyRoles=['系统/数值','玩法/战斗','内容/叙事','活动/运营'];
  const roleCounts=keyRoles.map(role=>({role,count:state.people.filter(p=>p.role===role).length}));
  const bucket=v=>v>=3.65?2:v>=3.2?1:0;
  const boxes=Array.from({length:3},()=>Array.from({length:3},()=>[]));
  state.people.forEach(p=>{const performance=(num(p.scores.player)+num(p.scores.craft)+num(p.scores.delivery))/3;const potential=(num(p.scores.complexity)+num(p.scores.collaboration)+num(p.scores.exploration))/3;boxes[2-bucket(potential)][bucket(performance)].push(p);});
  return `<div class="hero"><div class="tagline">TALENT SIGNAL → HUMAN DECISION → ACTION</div><h2>让每一次项目实践，都成为下一次人才配置的依据。</h2><p>针对MMO策划岗位与项目阶段，持续沉淀可追溯证据；盘点结论由业务和HRBP共同校准，最终服务于新项目组队、人才培养与关键岗位备份。</p><button class="button" data-view="matching">开始新项目组队 →</button></div>
  <div class="grid kpis">
   <div class="card metric-card"><span class="metric-icon">◫</span><div class="label">当前盘点人数</div><div class="value">${state.people.length}</div><div class="hint">覆盖 ${roleCounts.length} 类策划岗位</div></div>
   <div class="card metric-card"><span class="metric-icon">◈</span><div class="label">待确认的人才信号</div><div class="value amber">${unconfirmed.length}</div><div class="hint">需要主管核实后进入判断</div></div>
   <div class="card metric-card"><span class="metric-icon">◴</span><div class="label">证据超过90天未更新</div><div class="value red">${stale.length}</div><div class="hint">提醒补充，不代表能力下降</div></div>
   <div class="card metric-card"><span class="metric-icon">↗</span><div class="label">待完成的人才行动</div><div class="value accent">${state.actions.filter(a=>a.status!=='已完成').length}</div><div class="hint">从讨论走向具体行动</div></div>
  </div>
  <div class="grid two"><div class="card"><div class="card-head"><div><h2>团队人才结构</h2><div class="sub">按策划岗位查看人才储备</div></div>${btn('查看人才画像','go-people','small ghost')}</div>
   ${roleCounts.map(x=>`<div class="bar-row"><span>${esc(x.role)}</span>${bar(x.count / Math.max(1,state.people.length)*100)}<b>${x.count}人</b></div>`).join('')}
   <div class="surface section-space"><strong>组队判断提示</strong><p>新项目抽调人选时，同时检查原项目对应岗位是否有备份。人数只是容量信号，还需打开档案核对能力与意愿。</p></div></div>
  <div class="card"><div class="card-head"><div><h2>待处理的连续信号</h2><div class="sub">来自方案评审、原型测试和版本复盘</div></div>${btn('进入信号台','go-signals','small ghost')}</div>
   ${unconfirmed.slice(0,4).map(e=>`<div class="signal"><div class="signal-icon">✦</div><div><div class="signal-title">${esc(person(e.personId)?.name||'未知')} · ${esc(e.title)}</div><div class="signal-summary">${esc(e.summary)}</div><div class="signal-meta">${esc(e.eventType)} · ${fmt(e.date)} · 待确认</div></div></div>`).join('') || '<div class="empty">暂无待确认信号</div>'}</div></div>
  <div class="grid equal section-space"><div class="card"><div class="card-head"><div><h2>传统盘点视角 · 九宫格</h2><div class="sub">模拟的绩效 × 潜力对照，仅作为讨论入口</div></div></div><div class="ninebox">${boxes.flatMap((row,ri)=>row.map((cell,ci)=>`<div class="ninecell ${ri===0&&ci===2?'highlight':''}"><small>${['高','中','低'][ri]}潜力 · ${['低','中','高'][ci]}绩效</small><div>${cell.map(p=>`<button data-person="${esc(p.id)}">${esc(p.name)}</button>`).join('')||'<span class="tiny">—</span>'}</div></div>`)).join('')}</div><p class="callout section-space">此处按六项模拟评分映射九宫格；“潜力”必须指向具体目标岗位，最终应打开个人档案核对证据、意愿和项目情境。</p></div><div class="card"><h2>从半年盘点到连续追踪</h2><div class="step-list section-space"><div class="step"><span class="step-n">旧</span><div><strong>半年一次集中回忆</strong><p>贡献容易散落在版本复盘、评审和主管记忆里。</p></div></div><div class="step"><span class="step-n">新</span><div><strong>关键事件即留下证据</strong><p>只新增变化，不要求主管反复填写全员大表。</p></div></div><div class="step"><span class="step-n">审</span><div><strong>定期人工校准</strong><p>先确认事实，再判断适配，最后落到行动。</p></div></div></div></div></div>
  <div class="card section-space"><div class="card-head"><div><h2>持续盘点如何运行</h2><div class="sub">更新事实与校准判断采用不同频率</div></div></div><div class="flow"><span>关键事件轻记录</span><i>→</i><span>主管确认事实</span><i>→</i><span>月度关注变化</span><i>→</i><span>季度或组队前校准</span><i>→</i><span>人才行动回写</span></div></div>`;
}

function renderPeople(){
 const list=state.people.filter(p=>(filterRole==='全部岗位'||p.role===filterRole)&&(!filterQuery||`${p.name}${p.title}${p.team}`.includes(filterQuery)));
 const chosen=person(state.selectedPersonId)||list[0]||state.people[0];
 return `<div class="filters"><input class="input" id="peopleSearch" placeholder="搜索姓名、岗位或团队" value="${esc(filterQuery)}" /><select class="select" id="peopleRole">${options(['全部岗位',...Object.keys(roleProfiles)],filterRole)}</select>${btn('添加人员','add-person','small ghost')}</div>
 <div class="grid two"><div class="card"><div class="card-head"><div><h2>团队名单</h2><div class="sub">${list.length} 人 · 点击查看证据与发展意愿</div></div></div><div class="table-wrap"><table><thead><tr><th>人员</th><th>专业方向</th><th>流动意愿</th><th>证据状态</th><th>最近更新</th></tr></thead><tbody>${list.map(p=>{const h=evidenceHealth(p);return `<tr class="clickable" data-person="${esc(p.id)}"><td><span class="person-name">${esc(p.name)}</span><br><span class="tiny">${esc(p.title)}</span></td><td>${esc(p.role)}</td><td>${pill(p.mobility,p.mobility==='暂不流动'?'amber':'')}</td><td>${pill(h.label,h.tone)}</td><td>${h.latest?fmt(h.latest):'—'}</td></tr>`}).join('')}</tbody></table></div>${list.length?'':'<div class="empty">没有符合筛选条件的人员</div>'}</div>
 <div class="stack">${chosen?renderProfile(chosen):'<div class="card empty">请先导入人员数据</div>'}</div></div>`;
}
function renderProfile(p){
 const h=evidenceHealth(p), ev=evFor(p.id), m=match(p);
 return `<div class="card"><div class="profile-top"><div class="avatar">${esc(p.name.slice(-1))}</div><div><h2>${esc(p.name)}</h2><p>${esc(p.title)} · ${esc(p.team)}</p></div></div><div class="profile-pills">${pill(p.role)}${pill(p.mobility,p.mobility==='暂不流动'?'amber':'')}${pill('证据'+h.label,h.tone)}</div>
 <div class="card-head"><h3>岗位能力画像 <span class="tiny">1–4级 · 模拟评价</span></h3>${btn('人工校准画像','calibrate-person','small ghost')}</div>${dimensions.map(d=>`<div class="dimension-row"><span>${esc(d.name)}</span>${bar(num(p.scores?.[d.id])*25,num(p.scores?.[d.id])<3?'amber':'')}<b>${num(p.scores?.[d.id])}/4</b></div>`).join('')}
 <div class="note section-space">目标：${esc(matchStage)} · ${esc(matchRole)}。当前为规则初筛 ${m.score} 分；${m.evidence.label}。该数字仅用于排序，最终需要业务负责人、HRBP与员工确认。${state.calibrations?.filter(c=>c.personId===p.id).length?` 已记录 ${state.calibrations.filter(c=>c.personId===p.id).length} 次人工校准。`:''}</div></div>
 <div class="card"><div class="card-head"><div><h2>贡献证据时间线</h2><div class="sub">最近事件在前 · 点击可核对来源</div></div>${btn('补充证据','add-evidence','small ghost')}</div>${ev.map(e=>`<div class="signal"><div class="signal-icon">${confirmed(e)?'✓':'?'}</div><div><div class="signal-title">${esc(e.title)} ${pill(e.status,e.status==='待确认'?'amber':'')}</div><div class="signal-summary">${esc(e.summary)}</div><div class="signal-meta">${fmt(e.date)} · ${esc(e.eventType)} · ${esc(e.dimension)} · ${esc(e.source)}</div></div></div>`).join('')||'<div class="empty">暂无证据。请补充事件记录。</div>'}</div>${renderEvidenceAudit(p)}`;
}

function auditList(value, limit=4){return Array.isArray(value)?value.slice(0,limit):[];}
function normaliseAudit(value){
 const data=value?.audit||value||{};
 const findings=auditList(data.supported_findings).map(x=>({claim:String(x?.claim||'').trim(),evidenceIds:auditList(x?.evidence_ids,4).map(String)})).filter(x=>x.claim);
 const risks=auditList(data.risks).map(x=>({type:String(x?.type||'待核验').trim(),description:String(x?.description||'').trim(),evidenceIds:auditList(x?.evidence_ids,4).map(String)})).filter(x=>x.description);
 const questions=auditList(data.follow_up_questions).map(x=>({question:String(x?.question||'').trim(),why:String(x?.why||'').trim()})).filter(x=>x.question);
 const actions=auditList(data.verification_actions,3).map(x=>({action:String(x?.action||'').trim(),owner:String(x?.owner||'直属主管 / HRBP').trim(),days:Math.max(7,Math.min(90,Number(x?.days)||30))})).filter(x=>x.action);
 return {confidence:['高','中','低'].includes(data.confidence)?data.confidence:'低',summary:String(data.summary||'').trim(),findings,risks,questions,actions};
}
function auditEvidenceNames(ids){return ids.map(id=>state.evidence.find(e=>e.id===id)?.title).filter(Boolean).join('、');}
function renderEvidenceAudit(p){
 const current=evidenceAudit.personId===p.id?evidenceAudit:{personId:p.id,status:'等待运行',model:evidenceAudit.model,result:null};
 const result=current.result;
 return `<div class="card evidence-audit"><div class="card-head"><div><div class="tagline-red">AI EVIDENCE AUDIT</div><h2>AI人才证据审计与追问助手</h2><div class="sub">检查证据充分性、归属与时效，生成下一次沟通问题；不自动改分。</div></div>${pill('人工决策','gray')}</div>
 <div class="form-grid audit-controls"><div class="field"><label>DeepSeek API Key</label><input class="input" id="auditDeepseekKey" type="password" placeholder="${deepseekKey?'当前会话已填写':'sk-...'}" autocomplete="off" /></div><div class="field"><label>模型</label><select class="select" id="auditDeepseekModel"><option value="deepseek-flash" ${current.model==='deepseek-flash'?'selected':''}>deepseek-flash</option><option value="deepseek-v4-pro" ${current.model==='deepseek-v4-pro'?'selected':''}>deepseek-v4-pro</option></select></div><div class="field wide"><button class="button" data-action="run-evidence-audit">审计 ${esc(p.name)} 的证据</button></div></div>
 <div class="note section-space"><strong>${esc(current.status)}</strong><br><span class="tiny">仅发送该员工的模拟画像与证据；Key 只保留在当前页面内存。真实落地需脱敏、权限控制和服务端代理。</span></div>
 ${result?`<div class="audit-overview section-space"><div><span class="tiny">证据结论可信度</span><strong>${esc(result.confidence)}</strong></div><p>${esc(result.summary||'模型未给出总体摘要')}</p></div><div class="audit-grid section-space">
 <section><h3>已得到支持的判断</h3>${result.findings.map(x=>`<div class="audit-item"><strong>${esc(x.claim)}</strong>${x.evidenceIds.length?`<small>依据：${esc(auditEvidenceNames(x.evidenceIds)||x.evidenceIds.join('、'))}</small>`:''}</div>`).join('')||'<div class="empty">没有足够证据形成稳定判断</div>'}</section>
 <section><h3>证据风险与缺口</h3>${result.risks.map(x=>`<div class="audit-item"><span class="pill amber">${esc(x.type)}</span><p>${esc(x.description)}</p>${x.evidenceIds.length?`<small>相关记录：${esc(auditEvidenceNames(x.evidenceIds)||x.evidenceIds.join('、'))}</small>`:''}</div>`).join('')||'<div class="empty">模型未指出明确风险，仍需人工复核</div>'}</section>
 <section><h3>下一次沟通追问</h3><ol>${result.questions.map(x=>`<li><strong>${esc(x.question)}</strong>${x.why?`<small>${esc(x.why)}</small>`:''}</li>`).join('')}</ol></section>
 <section><h3>建议补证行动</h3>${result.actions.map(x=>`<div class="audit-item"><strong>${esc(x.action)}</strong><small>${esc(x.owner)} · ${x.days}天内</small></div>`).join('')||'<div class="empty">暂无建议行动</div>'}</section></div><div class="button-row section-space"><button class="button small ghost" data-action="copy-audit-questions">复制追问清单</button>${result.actions.length?'<button class="button small" data-action="commit-audit-actions">加入人才行动跟踪</button>':''}<button class="button small ghost" data-action="clear-evidence-audit">清空结果</button></div><p class="tiny">AI输出属于讨论材料。HRBP和业务负责人需核对原始证据、贡献归属与员工意愿。</p>`:''}</div>`;
}

function renderSignals(){
 const pending=state.evidence.filter(e=>!confirmed(e)).sort((a,b)=>b.date.localeCompare(a.date));
 const recent=state.evidence.filter(e=>age(e.date)<=30);
 return `${renderMeetingImporter()}<div class="grid kpis"><div class="card metric-card"><div class="label">30天内关键事件</div><div class="value">${recent.length}</div><div class="hint">随项目节奏发生</div></div><div class="card metric-card"><div class="label">待主管确认</div><div class="value amber">${pending.length}</div><div class="hint">未确认不改变人才判断</div></div><div class="card metric-card"><div class="label">已核实证据</div><div class="value accent">${state.evidence.filter(confirmed).length}</div><div class="hint">保留来源与日期</div></div><div class="card metric-card"><div class="label">证据覆盖人数</div><div class="value">${new Set(state.evidence.map(e=>e.personId)).size}</div><div class="hint">${state.people.length} 人中已有记录</div></div></div>
 <div class="grid two"><div class="card"><div class="card-head"><div><h2>待确认信号</h2><div class="sub">主管只处理发生变化的记录</div></div>${btn('记录新事件','add-evidence','small')}</div>
 ${pending.map(e=>`<div class="signal"><div class="signal-icon">✦</div><div style="flex:1"><div class="signal-title">${esc(person(e.personId)?.name||'未知')} · ${esc(e.title)}</div><div class="signal-summary">${esc(e.summary)}</div><div class="signal-meta">${fmt(e.date)} · ${esc(e.eventType)} · 来源：${esc(e.source)}</div><div class="button-row section-space"><button class="button small" data-confirm="${esc(e.id)}">确认事实</button><button class="button small ghost" data-open-evidence="${esc(e.id)}">查看完整记录</button></div></div></div>`).join('')||'<div class="empty">所有信号已处理</div>'}</div>
 <div class="stack"><div class="card"><h2>轻量更新机制</h2><div class="step-list section-space"><div class="step"><span class="step-n">1</span><div><strong>关键事件后留一张卡</strong><p>任务、本人贡献、结果、来源四个信息即可。</p></div></div><div class="step"><span class="step-n">2</span><div><strong>主管每月处理待确认</strong><p>只看新事件、过期证据和行动到期项。</p></div></div><div class="step"><span class="step-n">3</span><div><strong>季度或组队前做校准</strong><p>区分事实更新和人才判断，保留分歧记录。</p></div></div></div></div><div class="card"><h2>记录质量提醒</h2><div class="insight-list section-space"><div class="insight"><span class="dot red"></span><span>证据缺失表示“尚未验证”，不能解释为能力不足。</span></div><div class="insight"><span class="dot"></span><span>版本指标受多人与外部因素影响，不直接等同个人绩效。</span></div><div class="insight"><span class="dot green"></span><span>AI可整理材料；人员评价和机会分配由人负责。</span></div></div></div></div></div>`;
}

function renderMeetingImporter(){
 const p=person(meetingImport.personId)||state.people[0];
 const candidates=meetingImport.candidates||[];
 return `<div class="card meeting-import"><div class="card-head"><div><div class="tagline-red">MEETING → SIGNAL</div><h2>上传沟通纪要，生成候选能力信号</h2><div class="sub">文件先在浏览器本地提取文字；候选信号经人工确认后才进入人才档案。</div></div>${pill('不自动评分','gray')}</div>
 <div class="form-grid three"><div class="field"><label>谈话对象</label><select class="select" id="meetingPerson">${state.people.map(x=>`<option value="${esc(x.id)}" ${x.id===p?.id?'selected':''}>${esc(x.name)} · ${esc(x.role)}</option>`).join('')}</select></div><div class="field wide-file"><label>会议纪要文件</label><input class="input file-input" id="meetingFile" type="file" accept=".txt,.md,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></div></div><div class="button-row section-space"><a class="button small ghost" href="sample-data/叶知行_一对一沟通纪要_模拟.txt" download>下载测试纪要 TXT</a><span class="tiny">支持 TXT、Markdown、Word .docx；暂不支持旧版 .doc。</span></div>
 <div class="meeting-flow section-space"><span>01 上传 TXT / MD / DOCX</span><i>→</i><span>02 提取原文</span><i>→</i><span>03 生成候选信号</span><i>→</i><span>04 人工确认入档</span></div>
 <div class="note section-space"><strong>${esc(meetingImport.status)}</strong>${meetingImport.fileName?`<br>文件：${esc(meetingImport.fileName)} · 已提取 ${meetingImport.text.length} 个字符 · 当前对象：${esc(p?.name||'未选择')}`:''}</div>
 ${meetingImport.text?`<details class="source-preview section-space"><summary>查看提取的纪要原文</summary><p>${esc(meetingImport.text.slice(0,1400)).replace(/\n/g,'<br>')}${meetingImport.text.length>1400?'…':''}</p></details>
 <div class="ai-panel section-space"><div class="form-grid three"><div class="field"><label>DeepSeek API Key（可选）</label><input class="input" id="meetingDeepseekKey" type="password" placeholder="${deepseekKey?'当前会话已填写':'sk-...'}" autocomplete="off" /></div><div class="field"><label>模型</label><select class="select" id="meetingDeepseekModel"><option value="deepseek-flash" ${meetingImport.model==='deepseek-flash'?'selected':''}>deepseek-flash</option><option value="deepseek-v4-pro" ${meetingImport.model==='deepseek-v4-pro'?'selected':''}>deepseek-v4-pro</option></select></div><div class="field action-field"><label>解析方式</label><button class="button" data-action="analyse-meeting-ai">DeepSeek 深度解析</button></div></div><p class="tiny">本地规则解析不会上传文件。点击 DeepSeek 解析后，提取出的纪要文字会发送给 DeepSeek；真实材料请先匿名化并确认授权。Key 不写入本地存储。</p></div>`:''}
 ${candidates.length?`<div class="draft-head section-space"><div><h3>候选信号 · ${candidates.length} 条</h3><p>请核对贡献归属、上下文和能力维度。可编辑后再入档。</p></div><div class="button-row"><button class="button small ghost" data-action="clear-meeting-import">清空</button><button class="button small" data-action="import-meeting-signals">将选中项加入待确认</button></div></div><div class="draft-grid">${candidates.map((x,i)=>`<div class="draft-card ${x.selected?'selected':''}"><label class="check-line"><input type="checkbox" data-draft-select="${i}" ${x.selected?'checked':''}/> 选入待确认队列</label><div class="form-grid section-space"><div class="field"><label>候选标题</label><input class="input" data-draft-title="${i}" value="${esc(x.title)}" maxlength="80" /></div><div class="field"><label>对应能力</label><select class="select" data-draft-dimension="${i}">${options(dimensions.map(d=>d.name),x.dimension)}</select></div><div class="field wide"><label>事实摘要</label><textarea class="textarea compact" data-draft-summary="${i}" maxlength="500">${esc(x.summary)}</textarea></div></div><div class="draft-meta">${pill(x.confidence+'置信线索',x.confidence==='低'?'amber':'')} <span>${esc(x.reason)}</span></div>${x.quote?`<blockquote>原文：${esc(x.quote)}</blockquote>`:''}</div>`).join('')}</div>`:meetingImport.text?'<div class="empty">未识别到明确候选信号。可尝试 DeepSeek 深度解析，或继续使用“记录新事件”。</div>':''}</div>`;
}

function renderMatching(){
 const candidates=state.people.map(p=>({p,m:match(p)})).sort((a,b)=>b.m.score-a.m.score);
 const active=selectedCandidate ? person(selectedCandidate) : candidates[0]?.p;
 const activeMatch=active?match(active):null;
 const backup=active?state.people.filter(p=>p.id!==active.id&&p.role===active.role).length:0;
 return `<div class="card"><div class="card-head"><div><h2>定义新项目需要什么人</h2><div class="sub">调整任务情境后，匹配依据随之变化</div></div>${btn('调整能力权重','go-settings','small ghost')}</div><div class="form-grid three"><div class="field"><label>目标岗位</label><select class="select" id="matchRole">${options(Object.keys(roleProfiles),matchRole)}</select></div><div class="field"><label>项目阶段</label><select class="select" id="matchStage">${options(['孵化探索','研发制作','上线运营'],matchStage)}</select></div><div class="field"><label>业务任务</label><input class="input" value="新MMO项目核心模块筹备" disabled /></div></div><div class="callout section-space">排序依据：能力评价 × 岗位/阶段权重，叠加岗位方向与本人流动意愿；证据质量单独显示。分值是讨论线索，未经人工校准不用于任用决定。</div></div>
 <div class="grid two section-space"><div class="card"><div class="card-head"><div><h2>候选人初筛</h2><div class="sub">选择人选，检查证据与原项目影响</div></div></div>${candidates.slice(0,8).map(({p,m})=>`<div class="candidate ${active?.id===p.id?'selected':''}" data-candidate="${esc(p.id)}"><div><h3>${esc(p.name)} ${pill(p.role)} ${pill(m.evidence.label,m.evidence.tone)}</h3><p>${esc(p.title)} · ${esc(p.mobility)}</p></div><div class="score-lg">${m.score}</div><div class="candidate-reason">优势：${esc(m.strongest)}；${m.gaps.length?'待验证：'+esc(m.gaps.join('、')):'核心维度暂无明显低分项'}。${m.mobility==='暂不流动'?'本人目前不愿流动，需尊重意愿。':''}</div></div>`).join('')||'<div class="empty">暂无候选人</div>'}</div>
 <div class="stack">${active?`<div class="card"><div class="card-head"><div><h2>${esc(active.name)} · 匹配解释</h2><div class="sub">${esc(matchRole)} / ${esc(matchStage)}</div></div>${pill(activeMatch.evidence.label,activeMatch.evidence.tone)}</div><div class="bar-row"><span>能力匹配</span>${bar(activeMatch.score)}<b>${activeMatch.score}</b></div><div class="insight-list section-space"><div class="insight"><span class="dot green"></span><span>优势证据指向：${esc(activeMatch.strongest)}。</span></div><div class="insight"><span class="dot ${activeMatch.gaps.length?'':'green'}"></span><span>${activeMatch.gaps.length?'待验证能力：'+esc(activeMatch.gaps.join('、')):'目标权重较高的维度已达到3级及以上'}。</span></div><div class="insight"><span class="dot ${active.mobility==='暂不流动'?'red':'green'}"></span><span>流动意愿：${esc(active.mobility)}。需要与本人进行发展对话。</span></div><div class="insight"><span class="dot"></span><span>若从老项目抽调，原岗位仍有 ${backup} 位同类策划；需进一步确认实际备份能力。</span></div></div><div class="button-row section-space"><button class="button" data-action="create-action">建立验证行动</button><button class="button ghost" data-action="view-candidate">查看个人档案</button></div></div><div class="card"><h2>推荐的人工校准问题</h2><div class="step-list section-space"><div class="step"><span class="step-n">1</span><div><strong>证据是否属于本人贡献？</strong><p>确认具体角色与协作边界。</p></div></div><div class="step"><span class="step-n">2</span><div><strong>新项目还缺什么验证？</strong><p>安排原型任务或短期试岗。</p></div></div><div class="step"><span class="step-n">3</span><div><strong>老项目谁来接续？</strong><p>同步培养备份或调整项目计划。</p></div></div></div></div>`:'<div class="card empty">请先导入人才数据</div>'}</div></div>`;
}

function reportText(){
 const pending=state.evidence.filter(e=>!confirmed(e)).length;
 const stale=state.people.filter(p=>!evidenceHealth(p).latest||age(evidenceHealth(p).latest)>90).length;
 const ranked=state.people.map(p=>({p,m:match(p)})).sort((a,b)=>b.m.score-a.m.score);
 const top=ranked.slice(0,3).map(({p,m})=>`${p.name}（${p.role}，初筛${m.score}分，${m.evidence.label}，${p.mobility}）`).join('、');
 return `MMO策划人才盘点诊断（模拟数据）\n盘点范围：${state.people.length}人，${state.evidence.length}条事件证据。\n目标任务：${matchStage}阶段的${matchRole}岗位。\n初筛候选：${top||'暂无'}。\n数据质量：${pending}条证据待确认，${stale}人的最近证据超过90天。\n建议动作：确认待审证据；针对新项目安排小范围任务验证；抽调前检查老项目备份；与候选人确认意愿。\n注意：初筛分数不是人事决定，需主管、HRBP及员工进一步核实。`;
}
function renderReport(){
 const pending=state.evidence.filter(e=>!confirmed(e)).length;
 const stale=state.people.filter(p=>!evidenceHealth(p).latest||age(evidenceHealth(p).latest)>90).length;
 const ranked=state.people.map(p=>({p,m:match(p)})).sort((a,b)=>b.m.score-a.m.score);
 return `<div class="page-controls"><span class="callout">报告基于当前页面数据实时生成 · ${esc(today())}</span><div class="button-row">${btn('复制摘要','copy-report','ghost')}${btn('打印 / 保存PDF','print-report','dark')}</div></div>
 <article class="report-sheet"><div class="report-kicker">TALENT COMPASS · DEMO REPORT</div><h2>MMO策划团队人才诊断</h2><p>目标场景：老项目持续运营，同时为新项目 ${esc(matchStage)} 阶段补充 ${esc(matchRole)} 人才。以下为模拟数据的流程演示。</p>
 <div class="grid kpis section-space"><div class="surface"><strong>${state.people.length} 人</strong><p>当前盘点范围</p></div><div class="surface"><strong>${state.evidence.length} 条</strong><p>项目事件证据</p></div><div class="surface"><strong>${pending} 条</strong><p>等待主管确认</p></div><div class="surface"><strong>${stale} 人</strong><p>证据超过90天</p></div></div>
 <h3>01 · 团队判断</h3><p>当前人才储备覆盖 ${Object.keys(roleProfiles).filter(r=>state.people.some(p=>p.role===r)).length} 类策划方向。新项目组队需要同时验证目标能力、本人意愿、证据时效，以及从老项目抽调后的岗位接续。</p>
 <h3>02 · 优先讨论人选</h3><div class="table-wrap"><table><thead><tr><th>人员</th><th>岗位</th><th>初筛分</th><th>证据</th><th>流动意愿</th></tr></thead><tbody>${ranked.slice(0,5).map(({p,m})=>`<tr><td>${esc(p.name)}</td><td>${esc(p.role)}</td><td>${m.score}</td><td>${esc(m.evidence.label)}</td><td>${esc(p.mobility)}</td></tr>`).join('')}</tbody></table></div><p class="tiny">注：分数只用于排列讨论顺序。它不是晋升、调岗或淘汰结论。</p>
 <h3>03 · 建议采取的动作</h3><ul><li>请直属主管核实 ${pending} 条待确认事件，并补足贡献归属。</li><li>对 ${stale} 位证据较旧的员工补充近期任务复盘；缺少证据暂记为“待验证”。</li><li>为新项目候选人安排小范围原型或模块任务，再与本人沟通意愿。</li><li>抽调核心人选前，明确老项目交接与备份方案。</li></ul>
 <h3>04 · 已建立的人才行动</h3>${state.actions.length?`<div class="table-wrap"><table><thead><tr><th>行动</th><th>人员</th><th>负责人</th><th>到期</th><th>状态</th></tr></thead><tbody>${state.actions.map(a=>`<tr><td>${esc(a.title)}</td><td>${esc(person(a.personId)?.name||'—')}</td><td>${esc(a.owner)}</td><td>${esc(a.due)}</td><td>${esc(a.status)}</td></tr>`).join('')}</tbody></table></div>`:'<p>暂无行动，请在组队页建立验证任务。</p>'}
 ${aiText?`<h3>05 · AI辅助撰写的讨论提纲</h3><p>${esc(aiText).replace(/\n/g,'<br>')}</p><p class="tiny">AI文本需HRBP和业务负责人核实，不自动改变人员评分。</p>`:''}
 <div class="note section-space">证据由项目事件持续更新；人员判断在月度关注与季度/组队前校准。模拟数据不代表网易内部事实。</div></article>
 <div class="card section-space"><div class="card-head"><div><h2>可选：DeepSeek辅助生成讨论提纲</h2><div class="sub">只发送当前报告摘要；结果不修改评分或行动</div></div></div><div class="form-grid"><div class="field"><label>API Key（仅当前页面会话，不写入本地存储或仓库）</label><input class="input" type="password" id="deepseekKey" placeholder="sk-..." autocomplete="off" /></div><div class="field"><label>模型</label><select class="select" id="deepseekModel"><option value="deepseek-flash">deepseek-flash</option><option value="deepseek-v4-pro">deepseek-v4-pro</option></select></div></div><div class="button-row section-space"><button class="button" id="runAi">生成讨论提纲</button><span class="callout" id="aiStatus">仅发送模拟报告摘要到DeepSeek；最终文字需人工核验。</span></div></div>`;
}

function renderSettings(){
 const weights=state.config.weights;
 return `<div class="grid two"><div class="stack"><div class="card"><div class="card-head"><div><h2>目标岗位画像</h2><div class="sub">按岗位方向与项目阶段设置能力关注点</div></div>${btn('恢复建议权重','reset-weights','small ghost')}</div><div class="form-grid"><div class="field"><label>岗位方向</label><select class="select" id="configRole">${options(Object.keys(roleProfiles),state.config.targetRole)}</select></div><div class="field"><label>项目阶段</label><select class="select" id="configStage">${options(['孵化探索','研发制作','上线运营'],state.config.stage)}</select></div></div><div class="section-space">${dimensions.map(d=>`<div class="config-row"><span title="${esc(d.description)}">${esc(d.name)}</span><input type="range" min="0" max="40" step="5" value="${num(weights[d.id])}" data-weight="${esc(d.id)}" /><strong>${num(weights[d.id])}</strong></div>`).join('')}</div><div class="note section-space">权重用于生成讨论顺序。岗位标准与行为等级应由业务负责人和HRBP在试点中共同校准。</div></div>
 <div class="card"><div class="card-head"><div><h2>数据导入</h2><div class="sub">CSV上传后可立即进入画像、团队诊断与组队</div></div></div><div class="upload-box"><strong>上传人员或证据 CSV</strong><p>按模板列名导入；系统检查人员ID、评分范围和日期</p><input class="file-input" id="csvUpload" type="file" accept=".csv,text/csv" /></div><div class="button-row section-space">${btn('下载人员模板','template-people','small ghost')}${btn('下载证据模板','template-evidence','small ghost')}</div><div class="button-row section-space"><a class="button small ghost" href="sample-data/日常关键事件_模拟.csv" download>日常记录样例</a><a class="button small ghost" href="sample-data/季度盘点纪要_模拟.csv" download>季度纪要样例</a><a class="button small ghost" href="sample-data/季度人才校准会纪要_原始模拟.md" download>原始纪要</a></div><p class="callout">人员表：person_id、name、role、team、project、stage、mobility、title、六项能力等级。证据表：person_id、title、event_type、summary、dimension、date、status、source。导入数据只保存在当前浏览器。</p><div class="button-row section-space">${btn('恢复模拟数据','reset-demo','small warn')}${btn('导出当前数据','export-data','small ghost')}</div></div></div>
 <div class="stack"><div class="card"><h2>六项能力的行为说明</h2><div class="stack section-space">${dimensions.map(d=>`<div class="surface"><strong>${esc(d.name)}</strong><p>${esc(d.description)}</p></div>`).join('')}</div><div class="note section-space">1级：需要支持；2级：能完成明确任务；3级：能独立处理复杂任务；4级：能形成方法并影响他人。评分须附具体证据。</div></div><div class="card"><h2>导入原则</h2><div class="insight-list section-space"><div class="insight"><span class="dot green"></span><span>只需与人才判断相关的最小字段。</span></div><div class="insight"><span class="dot"></span><span>上传前对真实人员数据做匿名化，并确认使用授权。</span></div><div class="insight"><span class="dot red"></span><span>不能把工时、在线时长或单项游戏KPI直接当作个人能力。</span></div></div></div></div></div>`;
}
function render(){
 const renderer={overview:renderOverview,people:renderPeople,signals:renderSignals,matching:renderMatching,report:renderReport,settings:renderSettings}[view];
 app.innerHTML=renderer();
}

function evidenceForm(){
 showModal(`<h2>记录一条关键事件</h2><p>只填足以追溯贡献的必要信息。新记录先进入“待确认”队列。</p><form id="evidenceForm" class="form-grid"><div class="field"><label>人员</label><select class="select" name="personId" required>${state.people.map(p=>`<option value="${esc(p.id)}" ${p.id===state.selectedPersonId?'selected':''}>${esc(p.name)} · ${esc(p.role)}</option>`).join('')}</select></div><div class="field"><label>事件类型</label><select class="select" name="eventType">${options(['方案评审','原型测试','版本上线','版本复盘','线上问题','玩家反馈','带教完成'],'方案评审')}</select></div><div class="field wide"><label>事件标题</label><input class="input" name="title" required maxlength="80" placeholder="如：核心玩法原型测试" /></div><div class="field wide"><label>本人承担什么、产生什么结果</label><textarea class="textarea" name="summary" required maxlength="500"></textarea></div><div class="field"><label>对应能力</label><select class="select" name="dimension">${options(dimensions.map(d=>d.name),dimensions[0].name)}</select></div><div class="field"><label>发生日期</label><input class="input" name="date" type="date" value="${today()}" required /></div><div class="field wide"><label>来源或材料名称</label><input class="input" name="source" required placeholder="如：版本复盘文档、原型测试记录" /></div><div class="wide modal-actions"><button type="button" class="button ghost" data-action="close-modal">取消</button><button type="submit" class="button">加入待确认队列</button></div></form>`);
}
function addPersonForm(){
 showModal(`<h2>添加人员</h2><p>用于演示的简化录入。能力初值为2级，后续可补充证据。</p><form id="personForm" class="form-grid"><div class="field"><label>姓名或匿名代号</label><input class="input" name="name" required maxlength="30" /></div><div class="field"><label>策划岗位</label><select class="select" name="role">${options(Object.keys(roleProfiles),'系统/数值')}</select></div><div class="field"><label>团队</label><input class="input" name="team" value="项目策划组" required /></div><div class="field"><label>职位</label><input class="input" name="title" value="策划" required /></div><div class="field"><label>流动意愿</label><select class="select" name="mobility">${options(['需沟通','愿意探索','可流动','暂不流动'],'需沟通')}</select></div><div class="wide modal-actions"><button type="button" class="button ghost" data-action="close-modal">取消</button><button type="submit" class="button">添加</button></div></form>`);
}
function actionForm(){
 const p=person(selectedCandidate)||state.people[0]; if(!p)return;
 showModal(`<h2>建立人才验证行动</h2><p>为 ${esc(p.name)} 创建一项可跟踪的行动，让组队建议进入实际工作。</p><form id="actionForm" class="form-grid"><input type="hidden" name="personId" value="${esc(p.id)}" /><div class="field wide"><label>行动</label><input class="input" name="title" required value="参与新项目${esc(matchRole)}模块验证" /></div><div class="field"><label>负责人</label><input class="input" name="owner" required value="业务负责人 / HRBP" /></div><div class="field"><label>到期日期</label><input class="input" name="due" type="date" required value="${new Date(Date.now()+30*86400000).toISOString().slice(0,10)}" /></div><div class="wide modal-actions"><button type="button" class="button ghost" data-action="close-modal">取消</button><button type="submit" class="button">创建行动</button></div></form>`);
}
function calibrationForm(){
 const p=person(state.selectedPersonId);if(!p)return;
 showModal(`<h2>人工校准 · ${esc(p.name)}</h2><p>依据实际项目表现调整能力等级，填写证据与校准理由。保存后才会影响匹配排序。</p><form id="calibrationForm" class="form-grid"><input type="hidden" name="personId" value="${esc(p.id)}" />${dimensions.map(d=>`<div class="field"><label>${esc(d.name)}（当前 ${num(p.scores?.[d.id])}级）</label><select class="select" name="${esc(d.id)}">${[1,2,3,4].map(v=>`<option value="${v}" ${num(p.scores?.[d.id])===v?'selected':''}>${v}级 · ${['需要支持','完成明确任务','独立处理复杂任务','形成方法并影响他人'][v-1]}</option>`).join('')}</select></div>`).join('')}<div class="field wide"><label>校准依据与待验证项</label><textarea class="textarea" name="reason" required maxlength="400" placeholder="请指向具体项目事件，不以印象或单一业务指标定性"></textarea></div><div class="field"><label>校准人</label><input class="input" name="reviewer" required value="主管 / HRBP" /></div><div class="wide modal-actions"><button type="button" class="button ghost" data-action="close-modal">取消</button><button type="submit" class="button">保存校准记录</button></div></form>`);
}
function guide(){showModal(`<h2>现场演示路径 · 约4分钟</h2><div class="step-list section-space"><div class="step"><span class="step-n">1</span><div><strong>决策总览</strong><p>指出待确认信号、证据过期和关键岗位覆盖。</p></div></div><div class="step"><span class="step-n">2</span><div><strong>连续信号</strong><p>确认一条事件，展示轻量记录如何进入档案。</p></div></div><div class="step"><span class="step-n">3</span><div><strong>新项目组队</strong><p>切换岗位和阶段，比较候选人、证据和流动意愿。</p></div></div><div class="step"><span class="step-n">4</span><div><strong>诊断报告</strong><p>生成讨论材料，建立后续验证行动，打印为PDF。</p></div></div><div class="step"><span class="step-n">5</span><div><strong>画像配置与导入</strong><p>展示岗位权重调整、CSV导入与数据校验。</p></div></div></div><div class="modal-actions"><button class="button" data-action="close-modal">开始演示</button></div>`);}

function csvParse(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=ch;}
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);if(quoted)throw Error('CSV引号未闭合');
 const head=(rows.shift()||[]).map(x=>x.trim().replace(/^\ufeff/,''));
 return rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,(r[i]||'').trim()])));
}
function csvDownload(filename,headers,rows){
 const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const csv='\ufeff'+[headers.join(','),...rows.map(r=>headers.map(h=>q(r[h])).join(','))].join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const peopleHeaders=['person_id','name','role','team','project','stage','mobility','title',...dimensions.map(d=>d.id)];
const evidenceHeaders=['person_id','title','event_type','summary','dimension','date','status','source'];
function importCsv(file){
 file.text().then(text=>{
  const rows=csvParse(text);if(!rows.length)throw Error('文件没有数据行');
  const head=Object.keys(rows[0]);
  if(head.includes('name')&&head.includes('person_id')){
   const errors=[],next=[];
   rows.forEach((r,i)=>{if(!r.person_id||!r.name||!roleProfiles[r.role])errors.push(`第${i+2}行：人员ID、姓名或岗位无效`);if(state.people.some(p=>p.id===r.person_id)||next.some(p=>p.id===r.person_id))errors.push(`第${i+2}行：人员ID重复`);const scores={};dimensions.forEach(d=>{const v=Number(r[d.id]);if(!Number.isInteger(v)||v<1||v>4)errors.push(`第${i+2}行：${d.id}需为1–4`);scores[d.id]=v;});next.push({id:r.person_id,name:r.name,role:r.role,team:r.team||'未填写',project:r.project||'未填写',stage:r.stage||'未填写',mobility:r.mobility||'需沟通',title:r.title||'策划',scores});});
   if(errors.length)throw Error(errors.slice(0,5).join('；')+(errors.length>5?`；另有${errors.length-5}处问题`:''));
   state.people.push(...next);persist();render();toast(`成功导入 ${next.length} 位人员`);
  }else if(head.includes('event_type')&&head.includes('person_id')){
   const errors=[],next=[];
   rows.forEach((r,i)=>{if(!person(r.person_id))errors.push(`第${i+2}行：人员ID不存在`);if(!r.title||!r.summary||!r.date||Number.isNaN(new Date(r.date).getTime()))errors.push(`第${i+2}行：标题、摘要或日期无效`);next.push({id:'I'+Date.now()+i,personId:r.person_id,title:r.title,eventType:r.event_type||'项目事件',summary:r.summary,dimension:r.dimension||'专业设计',date:r.date,status:r.status||'待确认',source:r.source||'导入文件'});});
   if(errors.length)throw Error(errors.slice(0,5).join('；')+(errors.length>5?`；另有${errors.length-5}处问题`:''));
   state.evidence.push(...next);persist();render();toast(`成功导入 ${next.length} 条证据`);
  }else throw Error('未识别模板列名。请先下载人员或证据模板。');
 }).catch(error=>showModal(`<h2>导入未完成</h2><p>${esc(error.message)}</p><div class="modal-actions"><button class="button" data-action="close-modal">返回修改</button></div>`));
}
async function importMeetingFile(file){
 const nameMatches=state.people.filter(p=>file.name.includes(p.name));
 const matchedPerson=nameMatches.length===1?nameMatches[0]:null;
 if(matchedPerson)meetingImport.personId=matchedPerson.id;
 meetingImport.status=matchedPerson?`已从文件名识别谈话对象：${matchedPerson.name}；正在提取文字…`:'正在提取文件文字…';meetingImport.fileName=file.name;meetingImport.candidates=[];render();
 try{
  meetingImport.text=await readMeetingFile(file);
  meetingImport.candidates=localExtractSignals(meetingImport.text);
  meetingImport.mode='local';
  const attribution=matchedPerson?`，已匹配谈话对象 ${matchedPerson.name}`:'；请确认谈话对象';
  meetingImport.status=meetingImport.candidates.length?`本地快速解析完成，发现 ${meetingImport.candidates.length} 条候选信号${attribution}`:`文字提取完成，但本地规则未识别到明确能力信号${attribution}`;
  render();toast(`已读取 ${file.name}`);
 }catch(error){meetingImport={...meetingImport,text:'',candidates:[],status:`解析失败：${error.message}`};render();}
}
async function analyseMeetingWithAi(){
 const input=document.querySelector('#meetingDeepseekKey');
 deepseekKey=input?.value.trim()||deepseekKey;
 meetingImport.model=document.querySelector('#meetingDeepseekModel')?.value||meetingImport.model;
 if(!meetingImport.text){toast('请先上传会议纪要');return;}
 if(!meetingImport.personId){toast('请先选择谈话对象');return;}
 if(!deepseekKey){toast('请先输入DeepSeek API Key');return;}
 const target=person(meetingImport.personId);
 meetingImport.status='DeepSeek 正在梳理候选信号…';render();
 try{
  const allowed=dimensions.map(d=>d.name);
  const {content}=await callDeepSeek({apiKey:deepseekKey,model:meetingImport.model,json:true,maxTokens:2200,messages:[{role:'system',content:`你是HRBP证据整理助手。只提取纪要中与指定员工直接相关、可追溯的行为事实，不做绩效定级、晋升或去留判断，不补充原文没有的信息。能力维度只能取：${allowed.join('、')}。输出JSON对象：{"signals":[{"title":"不超过30字","summary":"本人承担什么及可观察结果","dimension":"允许的维度","evidence_quote":"支持判断的原文短句","confidence":"高/中/低","reason":"为何映射到该能力及待核验点"}]}。最多6条；证据不足时返回空数组。`},{role:'user',content:`谈话对象：${target?.name||meetingImport.personId}\n文件名：${meetingImport.fileName}\n会议纪要：\n${meetingImport.text}`}]});
  meetingImport.candidates=normaliseAiSignals(parseJsonObject(content),allowed);
  meetingImport.mode='ai';meetingImport.status=`DeepSeek 解析完成，生成 ${meetingImport.candidates.length} 条候选信号；请逐条人工核验`;
  render();toast('AI候选信号已生成，尚未写入档案');
 }catch(error){meetingImport.status=`AI解析失败：${error.message}。仍可使用本地候选信号或手动记录。`;render();}
}
function commitMeetingSignals(){
 const rows=(meetingImport.candidates||[]).filter(x=>x.selected&&x.title.trim()&&x.summary.trim());
 if(!rows.length){toast('请至少选择一条有效候选信号');return;}
 const stamp=Date.now();
 rows.forEach((x,i)=>state.evidence.push({id:'M'+stamp+i,personId:meetingImport.personId,title:x.title.trim(),eventType:'沟通纪要',summary:x.summary.trim(),dimension:x.dimension,date:today(),status:'待确认',source:`${meetingImport.fileName} · ${meetingImport.mode==='ai'?'AI辅助抽取':'本地规则抽取'}`}));
 persist();meetingImport={fileName:'',text:'',personId:meetingImport.personId,candidates:[],status:`已加入 ${rows.length} 条待确认信号`,model:meetingImport.model,mode:'local'};render();toast(`已加入 ${rows.length} 条待确认信号`);
}
async function runEvidenceAudit(){
 const p=person(state.selectedPersonId);
 if(!p){toast('请先选择一位员工');return;}
 const input=document.querySelector('#auditDeepseekKey');
 deepseekKey=input?.value.trim()||deepseekKey;
 const model=document.querySelector('#auditDeepseekModel')?.value||'deepseek-flash';
 if(!deepseekKey){toast('请先输入DeepSeek API Key');return;}
 const evidence=evFor(p.id).map(e=>({id:e.id,title:e.title,event_type:e.eventType,summary:e.summary,dimension:e.dimension,date:e.date,age_days:age(e.date),status:e.status,source:e.source}));
 evidenceAudit={personId:p.id,status:'DeepSeek 正在审计证据链…',model,result:null};render();
 try{
  const payload={person:{name:p.name,role:p.role,title:p.title,project:p.project,stage:p.stage,mobility:p.mobility},current_levels:Object.fromEntries(dimensions.map(d=>[d.name,num(p.scores?.[d.id])])),evidence};
  const {content}=await callDeepSeek({apiKey:deepseekKey,model,json:true,maxTokens:2600,messages:[{role:'system',content:'你是谨慎的HRBP人才证据审计助手。只审计证据质量，不重评员工、不修改能力等级、不提出晋升、淘汰或任用结论。重点检查：事实与评价是否混淆、贡献归属是否明确、来源能否交叉验证、证据是否过期、能力维度是否缺失、记录之间是否矛盾。证据不足必须明确写不确定。输出JSON对象，字段严格为：{"audit":{"confidence":"高/中/低","summary":"总体证据质量摘要，不超过100字","supported_findings":[{"claim":"有证据支持的谨慎判断","evidence_ids":["记录ID"]}],"risks":[{"type":"归属/时效/单一来源/矛盾/缺口/事实评价混淆","description":"风险说明","evidence_ids":["记录ID"]}],"follow_up_questions":[{"question":"下次沟通可直接询问的问题","why":"它要验证什么"}],"verification_actions":[{"action":"可执行的补证行动","owner":"直属主管/HRBP/员工本人","days":30}]}}。每个数组最多4项。'} ,{role:'user',content:`请审计以下模拟人才档案。\n${JSON.stringify(payload)}`} ]});
  evidenceAudit={personId:p.id,status:'审计完成，请由HRBP和业务负责人核对',model,result:normaliseAudit(parseJsonObject(content))};render();toast('AI证据审计已生成，不会自动修改评分');
 }catch(error){evidenceAudit={personId:p.id,status:`审计失败：${error.message}`,model,result:null};render();}
}
function commitAuditActions(){
 const p=person(evidenceAudit.personId), actions=evidenceAudit.result?.actions||[];
 if(!p||!actions.length){toast('没有可加入的验证行动');return;}
 const stamp=Date.now();
 actions.forEach((x,i)=>state.actions.push({id:'AA'+stamp+i,personId:p.id,title:x.action,owner:x.owner,due:new Date(Date.now()+x.days*86400000).toISOString().slice(0,10),status:'待开始',source:'AI证据审计建议 · 人工确认录入'}));
 persist();toast(`已将 ${actions.length} 项建议加入人才行动跟踪`);
}
function copyAuditQuestions(){
 const p=person(evidenceAudit.personId), questions=evidenceAudit.result?.questions||[];
 if(!p||!questions.length){toast('没有可复制的追问');return;}
 const text=`${p.name} · 证据核验追问\n`+questions.map((x,i)=>`${i+1}. ${x.question}${x.why?`\n   目的：${x.why}`:''}`).join('\n');
 navigator.clipboard.writeText(text).then(()=>toast('追问清单已复制')).catch(()=>toast('浏览器未允许复制'));
}
async function runAi(){
 const input=document.querySelector('#deepseekKey');const status=document.querySelector('#aiStatus');const button=document.querySelector('#runAi');
 deepseekKey=input?.value.trim()||deepseekKey;
 if(!deepseekKey){toast('请先输入DeepSeek API Key');return;}
 button.disabled=true;status.textContent='正在生成，请稍候…';
 try{
  const {content}=await callDeepSeek({apiKey:deepseekKey,model:document.querySelector('#deepseekModel').value,maxTokens:1400,messages:[{role:'system',content:'你是HRBP的报告写作助手。只根据给定的模拟数据，输出中文、简短的讨论提纲。不得给员工自动定性，不得虚构事实。请明确哪些判断需要人工核验。'},{role:'user',content:reportText()+'\n请给出三条业务讨论问题和三条下一步行动，每条不超过50字。'}]});
  aiText=content;
  render();toast('AI讨论提纲已生成，需人工核验');
 }catch(error){status.textContent=`生成失败：${error.message}。请检查Key、余额或模型权限；本地报告仍可使用。`;button.disabled=false;}
}

document.addEventListener('click',event=>{
 const nav=event.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
 const row=event.target.closest('[data-person]');if(row){state.selectedPersonId=row.dataset.person;persist();render();return;}
 const candidate=event.target.closest('[data-candidate]');if(candidate){selectedCandidate=candidate.dataset.candidate;render();return;}
 const confirm=event.target.closest('[data-confirm]');if(confirm){const e=state.evidence.find(x=>x.id===confirm.dataset.confirm);if(e){e.status='主管确认';persist();render();toast('事件已确认，证据状态已更新');}return;}
 const openEv=event.target.closest('[data-open-evidence]');if(openEv){const e=state.evidence.find(x=>x.id===openEv.dataset.openEvidence);if(e)showModal(`<h2>${esc(e.title)}</h2><p>${esc(e.summary)}</p><div class="surface"><strong>记录信息</strong><p>人员：${esc(person(e.personId)?.name)}<br>类型：${esc(e.eventType)}<br>能力：${esc(e.dimension)}<br>时间：${esc(e.date)}<br>状态：${esc(e.status)}<br>来源：${esc(e.source)}</p></div><div class="modal-actions"><button class="button ghost" data-action="close-modal">关闭</button></div>`);return;}
 const action=event.target.closest('[data-action]')?.dataset.action;
 if(action){
  if(action==='go-people')setView('people');
  else if(action==='go-signals')setView('signals');
  else if(action==='go-settings')setView('settings');
  else if(action==='add-evidence')evidenceForm();
  else if(action==='add-person')addPersonForm();
  else if(action==='create-action')actionForm();
  else if(action==='calibrate-person')calibrationForm();
  else if(action==='analyse-meeting-ai')analyseMeetingWithAi();
  else if(action==='run-evidence-audit')runEvidenceAudit();
  else if(action==='commit-audit-actions')commitAuditActions();
  else if(action==='copy-audit-questions')copyAuditQuestions();
  else if(action==='clear-evidence-audit'){evidenceAudit={personId:state.selectedPersonId,status:'等待运行',model:evidenceAudit.model,result:null};render();}
  else if(action==='import-meeting-signals')commitMeetingSignals();
  else if(action==='clear-meeting-import'){meetingImport={fileName:'',text:'',personId:meetingImport.personId,candidates:[],status:'等待上传会议纪要',model:meetingImport.model,mode:'local'};render();}
  else if(action==='view-candidate'){state.selectedPersonId=selectedCandidate||state.people[0]?.id;persist();setView('people');}
  else if(action==='close-modal')closeModal();
  else if(action==='reset-weights'){state.config.weights=roleWeights(state.config.targetRole,state.config.stage);persist();render();toast('已恢复建议权重');}
  else if(action==='template-people')csvDownload('人员导入模板.csv',peopleHeaders,[{person_id:'NEW01',name:'示例人员',role:'系统/数值',team:'项目策划组',project:'示例项目',stage:'成熟运营',mobility:'需沟通',title:'系统策划',player:3,craft:3,complexity:3,delivery:3,collaboration:3,exploration:3}]);
  else if(action==='template-evidence')csvDownload('证据导入模板.csv',evidenceHeaders,[{person_id:'P01',title:'示例方案评审',event_type:'方案评审',summary:'描述本人贡献、结果及需要核验的部分',dimension:'专业设计',date:today(),status:'待确认',source:'方案文档'}]);
  else if(action==='export-data'){const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mmo-talent-compass-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  else if(action==='reset-demo')showModal(`<h2>恢复模拟数据？</h2><p>这会覆盖当前浏览器里录入、导入和确认过的演示数据。建议先导出备份。</p><div class="modal-actions"><button class="button ghost" data-action="close-modal">取消</button><button class="button warn" data-action="confirm-reset">恢复</button></div>`);
  else if(action==='confirm-reset'){state=createDemoState();selectedCandidate=null;matchRole=state.config.targetRole;matchStage=state.config.stage;meetingImport={fileName:'',text:'',personId:state.selectedPersonId||state.people[0]?.id||'',candidates:[],status:'等待上传会议纪要',model:'deepseek-flash',mode:'local'};evidenceAudit={personId:'',status:'等待运行',model:'deepseek-flash',result:null};persist();closeModal();render();toast('已恢复模拟数据');}
  else if(action==='copy-report')navigator.clipboard.writeText(reportText()).then(()=>toast('报告摘要已复制')).catch(()=>toast('浏览器未允许复制'));
  else if(action==='print-report')window.print();
  return;
 }
 if(event.target.id==='openGuide')guide();
 if(event.target.id==='runAi')runAi();
});
document.addEventListener('change',event=>{
 const id=event.target.id;
 if(id==='peopleRole'){filterRole=event.target.value;render();}
 if(id==='matchRole'||id==='matchStage'){matchRole=document.querySelector('#matchRole')?.value||matchRole;matchStage=document.querySelector('#matchStage')?.value||matchStage;selectedCandidate=null;render();}
 if(id==='configRole'||id==='configStage'){state.config.targetRole=document.querySelector('#configRole')?.value||state.config.targetRole;state.config.stage=document.querySelector('#configStage')?.value||state.config.stage;state.config.weights=roleWeights(state.config.targetRole,state.config.stage);matchRole=state.config.targetRole;matchStage=state.config.stage;persist();render();}
 if(id==='csvUpload'&&event.target.files[0])importCsv(event.target.files[0]);
 if(id==='meetingFile'&&event.target.files[0])importMeetingFile(event.target.files[0]);
 if(id==='meetingPerson'){meetingImport.personId=event.target.value;render();}
 if(id==='meetingDeepseekModel')meetingImport.model=event.target.value;
 if(id==='auditDeepseekModel')evidenceAudit.model=event.target.value;
 if(event.target.matches('[data-draft-select]')){const item=meetingImport.candidates[Number(event.target.dataset.draftSelect)];if(item)item.selected=event.target.checked;}
 if(event.target.matches('[data-draft-dimension]')){const item=meetingImport.candidates[Number(event.target.dataset.draftDimension)];if(item)item.dimension=event.target.value;}
});
document.addEventListener('input',event=>{
 if(event.target.id==='peopleSearch'){filterQuery=event.target.value;const pos=event.target.selectionStart;render();const input=document.querySelector('#peopleSearch');input?.focus();input?.setSelectionRange(pos,pos);}
 if(event.target.matches('[data-weight]')){const id=event.target.dataset.weight;state.config.weights[id]=Number(event.target.value);event.target.nextElementSibling.textContent=event.target.value;persist();}
 if(event.target.matches('[data-draft-title]')){const item=meetingImport.candidates[Number(event.target.dataset.draftTitle)];if(item)item.title=event.target.value;}
 if(event.target.matches('[data-draft-summary]')){const item=meetingImport.candidates[Number(event.target.dataset.draftSummary)];if(item)item.summary=event.target.value;}
});
document.addEventListener('submit',event=>{
 if(event.target.id==='evidenceForm'){event.preventDefault();const d=Object.fromEntries(new FormData(event.target));state.evidence.push({id:'E'+Date.now(),personId:d.personId,title:d.title,eventType:d.eventType,summary:d.summary,dimension:d.dimension,date:d.date,status:'待确认',source:d.source});persist();closeModal();render();toast('新事件已加入待确认队列');}
 if(event.target.id==='personForm'){event.preventDefault();const d=Object.fromEntries(new FormData(event.target));const scores=Object.fromEntries(dimensions.map(x=>[x.id,2]));const id='P'+Date.now();state.people.push({id,name:d.name,role:d.role,team:d.team,project:'新项目',stage:'未指定',mobility:d.mobility,title:d.title,scores});state.selectedPersonId=id;persist();closeModal();render();toast('人员已添加，可继续补充证据');}
 if(event.target.id==='actionForm'){event.preventDefault();const d=Object.fromEntries(new FormData(event.target));state.actions.push({id:'A'+Date.now(),personId:d.personId,title:d.title,owner:d.owner,due:d.due,status:'待开始'});persist();closeModal();render();toast('人才行动已建立');}
 if(event.target.id==='calibrationForm'){event.preventDefault();const d=Object.fromEntries(new FormData(event.target));const p=person(d.personId);if(!p)return;const before={...p.scores};dimensions.forEach(x=>p.scores[x.id]=Number(d[x.id]));state.calibrations ||= [];state.calibrations.push({id:'C'+Date.now(),personId:p.id,before,after:{...p.scores},reason:d.reason,reviewer:d.reviewer,date:today()});persist();closeModal();render();toast('已保存人工校准和理由');}
});
render();
