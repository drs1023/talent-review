const API_URL = 'https://api.deepseek.com/chat/completions';

function parseApiError(text, status) {
  try {
    const data = JSON.parse(text);
    return data?.error?.message || data?.message || `HTTP ${status}`;
  } catch {
    return text?.trim().slice(0, 180) || `HTTP ${status}`;
  }
}

export function parseJsonObject(content) {
  const clean = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
  throw new Error('模型返回的内容不是有效 JSON');
}

export async function callDeepSeek({ apiKey, model='deepseek-flash', messages, maxTokens=1800, json=false, timeoutMs=60000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = {
      model,
      messages,
      max_tokens:maxTokens,
      stream:false,
      thinking:{type:'disabled'}
    };
    if (json) body.response_format = {type:'json_object'};
    const response = await fetch(API_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
      body:JSON.stringify(body),
      signal:controller.signal
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`DeepSeek ${response.status}：${parseApiError(raw,response.status)}`);
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('DeepSeek 返回了无法解析的响应'); }
    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim();
    if (!content) {
      const reason = choice?.finish_reason || '未知';
      const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens;
      const detail = reasoningTokens ? `，推理消耗 ${reasoningTokens} tokens` : '';
      throw new Error(`DeepSeek 未返回正文（停止原因：${reason}${detail}）`);
    }
    return {content,data};
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('DeepSeek 请求超过60秒，请稍后重试');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
