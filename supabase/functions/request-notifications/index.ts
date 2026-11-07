// Internal worker. Cron authenticates with x-request-mail-secret, never a user JWT.
// Do not log envelopes, provider bodies, addresses, or credential values.
type Envelope = {
  id: string; claim_token: string; kind: 'support' | 'deletion';
  audience: 'operator' | 'customer'; event: string; request_id: string;
  to_email: string | null; reply_to: string; payload: Record<string, unknown>;
};
type Delivery = { delivered: boolean; providerId?: string; code?: string; retryable?: boolean };
const json = (status: number, value: Record<string, unknown>) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const safeEmail = (value: unknown): value is string => typeof value === 'string' &&
  value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);

// Hash both strings to fixed length, then compare every byte regardless of input.
async function authorized(given: string, expected: string): Promise<boolean> {
  const digest = async (s: string) => new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function message(job: Envelope): { subject: string; text: string } {
  const operator = job.audience === 'operator';
  const reference = `申請編號：${job.request_id}`;
  if (job.kind === 'support') return {
    subject: operator ? 'IShift：新的客服需求' : 'IShift：已收到您的客服需求',
    text: operator
      ? `${reference}\n已收到客服需求。可直接回覆此信聯絡已驗證的使用者；若 Reply-To 為客服信箱，請先於後台查核聯絡方式。\n\n使用者內容（原文）：\n${String(job.payload.message ?? '')}`
      : `${reference}\n\n我們已收到您的客服需求，將由客服人員處理。您可以回覆此信補充資訊。\n\nIShift 客服\nappai@appai.info`,
  };
  const labels: Record<string, string> = {
    received: '已收到刪除帳號申請', pending: '等待處理', in_progress: '處理中',
    action_required: '需要您補充資訊', completed: '刪除流程已完成', rejected: '申請未完成',
  };
  const date = new Date(String(job.payload.due_at));
  if (!Number.isFinite(date.getTime()) || !labels[job.event]) throw new Error('invalid_envelope');
  const due = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  const status = labels[job.event];
  const note = typeof job.payload.note === 'string' && job.payload.note.trim()
    ? `\n處理說明：\n${job.payload.note}\n` : '';
  return {
    subject: `IShift：${status}`,
    text: `${reference}\n\n${status}。${note}\n本申請的處理目標為收到申請後 30 天內，目標日期為 ${due}（台灣時間）；此日期為處理目標。${job.event === 'completed' ? '\n客服已將此申請標記為完成。' : '\n若有需要補充的資訊或處理進度，我們會以電子郵件通知。'}\n${operator ? '\n請在受限後台查核帳號、共享資料及儲存空間後處理；本通知不會自動刪除任何資料。' : '\n您可直接回覆此信聯絡客服。'}\n\nIShift 客服\nappai@appai.info`,
  };
}

async function send(job: Envelope, key: string, from: string): Promise<Delivery> {
  if (!job.to_email) return { delivered: false, code: 'no_verified_contact' };
  if (!safeEmail(job.to_email) || !safeEmail(job.reply_to)) {
    return { delivered: false, code: 'invalid_envelope' };
  }
  let content: ReturnType<typeof message>;
  try { content = message(job); }
  catch { return { delivered: false, code: 'invalid_envelope' }; }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        'Idempotency-Key': job.id },
      body: JSON.stringify({ from, to: [job.to_email], reply_to: job.reply_to, ...content }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const retryable = response.status === 429 || response.status >= 500;
      return { delivered: false, code: retryable ? 'provider_unavailable' : 'provider_rejected', retryable };
    }
    const result = await response.json();
    if (typeof result.id !== 'string' || result.id.length < 1 || result.id.length > 200) {
      return { delivered: false, code: 'provider_response', retryable: true };
    }
    return { delivered: true, providerId: result.id };
  } catch {
    // Acceptance may have happened: retry only with the same immutable key/body.
    return { delivered: false, code: 'provider_timeout', retryable: true };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const secret = Deno.env.get('REQUEST_MAIL_WORKER_SECRET');
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('REQUEST_MAIL_FROM');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !key || !from || !url || !serviceKey || /[\r\n]/.test(from)) {
    return json(503, { error: 'configuration_unavailable' });
  }
  const given = request.headers.get('x-request-mail-secret') ?? '';
  if (!await authorized(given, secret)) return json(401, { error: 'unauthorized' });
  const rpc = async (name: string, body: Record<string, unknown>) => {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('database_unavailable'); }
    return response.json();
  };
  try {
    const jobs: Envelope[] = await rpc('claim_request_notifications', { p_limit: 10 });
    let accepted = 0;
    for (const job of jobs) {
      const result = await send(job, key, from);
      const recorded = await rpc('finish_request_notification', {
        p_id: job.id, p_claim_token: job.claim_token, p_delivered: result.delivered,
        p_provider_id: result.providerId ?? null, p_failure_code: result.code ?? null,
        p_retryable: result.retryable ?? false,
      });
      if (recorded && result.delivered) accepted++;
    }
    return json(200, { processed: jobs.length, accepted });
  } catch {
    // Unfinished claims recover after lease expiry, within the bounded retry window.
    return json(503, { error: 'delivery_unavailable' });
  }
});
