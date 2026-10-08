const keywordMap = {
  '玩家洞察': ['玩家','用户','反馈','体验','访谈','流失','满意','行为数据'],
  '专业设计': ['方案','设计','数值','系统','机制','世界观','关卡','叙事','经济','规则'],
  '复杂问题': ['风险','权衡','问题','定位','归因','长期','成本','复杂','异常','冲突'],
  '交付迭代': ['上线','交付','版本','迭代','验收','完成','复盘','推进','缺陷','里程碑'],
  '跨职能协同': ['协作','沟通','协调','程序','美术','测试','运营','跨组','带教','共同'],
  '0→1探索': ['原型','白盒','假设','探索','试错','创新','从零','概念验证','实验']
};

export async function readMeetingFile(file) {
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  let text='';
  if (ext==='txt'||ext==='md') text=await file.text();
  else if (ext==='docx') {
    if (!window.mammoth?.extractRawText) throw Error('Word解析组件未加载，请刷新页面后重试');
    const result=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    text=result.value||'';
  } else if (ext==='doc') throw Error('暂不支持旧版 .doc，请另存为 .docx 或 .txt 后上传');
  else throw Error('仅支持 TXT、Markdown 和 Word .docx 文件');
  text=text.replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  if (!text) throw Error('文件中没有提取到可用文字');
  if (text.length>30000) text=text.slice(0,30000);
  return text;
}

export function localExtractSignals(text) {
  const sentences=text.split(/[\n。！？!?；;]+/).map(x=>x.trim()).filter(x=>x.length>=8&&x.length<=260);
  const signals=[];
  Object.entries(keywordMap).forEach(([dimension,keywords])=>{
    const ranked=sentences.map(sentence=>{
      const hits=keywords.filter(k=>sentence.includes(k));
      return {sentence,hits,score:hits.length};
    }).filter(x=>x.score).sort((a,b)=>b.score-a.score||b.sentence.length-a.sentence.length);
    if (!ranked.length)return;
    const best=ranked[0];
    signals.push({
      title:`${dimension} · 纪要候选信号`,
      summary:best.sentence,
      dimension,
      quote:best.sentence,
      confidence:best.score>=3?'中':'低',
      reason:`本地规则命中：${best.hits.join('、')}`,
      selected:true
    });
  });
  return signals.slice(0,6);
}

export function normaliseAiSignals(value, allowedDimensions) {
  const rows=Array.isArray(value?.signals)?value.signals:[];
  return rows.slice(0,8).map((row,i)=>({
    title:String(row.title||`纪要候选信号 ${i+1}`).slice(0,80),
    summary:String(row.summary||row.evidence_quote||'').slice(0,500),
    dimension:allowedDimensions.includes(row.dimension)?row.dimension:'专业设计',
    quote:String(row.evidence_quote||'').slice(0,260),
    confidence:['高','中','低'].includes(row.confidence)?row.confidence:'低',
    reason:String(row.reason||'AI依据纪要提出，需人工核验').slice(0,160),
    selected:true
  })).filter(x=>x.summary);
}
