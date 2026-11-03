/// <reference types="@cloudflare/workers-types" />
interface Env {
  GH_REPO: string;
  ALLOWED_ORIGIN: string;
  GH_TOKEN?: string;
  RECAPTCHA_V3_SECRET: string;
  RECAPTCHA_V2_SECRET: string;
}

const FORMATS = { video: ['mp4', 'mkv', 'webm'], audio: ['mp3', 'm4a', 'opus', 'flac', 'wav'] } as const;
const QUALITIES = ['best', '2160', '1440', '1080', '720', '480', '360'];
const STEPS = ['Fetch tools', 'Download', 'Package and publish'];
const cooldown = new Map<string, number>();
const memo = new Map<string, { t: number; v: unknown }>();

function normalizeUrl(input: string): string | null {
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') return /^[\w-]{11}$/.test(parts[0] ?? '') ? `https://youtu.be/${parts[0]}` : null;
  if (host === 'youtube.com') {
    const path = parts[0] ?? '';
    const id = path === 'watch' ? url.searchParams.get('v') ?? '' : ['shorts', 'live', 'embed'].includes(path) ? parts[1] ?? '' : '';
    if (path === 'playlist') {
      const list = url.searchParams.get('list') ?? '';
      return /^[\w-]{10,64}$/.test(list) ? `https://www.youtube.com/playlist?list=${list}` : null;
    }
    if (!/^[\w-]{11}$/.test(id)) return null;
    const query = new URLSearchParams({ v: id });
    const list = url.searchParams.get('list') ?? '';
    if (/^[\w-]{10,64}$/.test(list)) query.set('list', list);
    return `https://www.youtube.com/watch?${query}`;
  }
  if (host === 'bilibili.com' && parts[0] === 'video' && /^(BV[0-9A-Za-z]{10}|av\d{1,12})$/i.test(parts[1] ?? '')) {
    const page = url.searchParams.get('p') ?? '';
    return `https://www.bilibili.com/video/${parts[1]}${/^\d{1,3}$/.test(page) ? `?p=${page}` : ''}`;
  }
  if (host === 'instagram.com') {
    const i = parts.findIndex((part) => ['p', 'reel', 'reels', 'tv'].includes(part));
    const code = i >= 0 ? parts[i + 1] ?? '' : '';
    if (!/^[\w-]{5,30}$/.test(code)) return null;
    return `https://www.instagram.com/${parts[i] === 'reels' ? 'reel' : parts[i]}/${code}/`;
  }
  return null;
}

function sourceMatches(url: string, source: string): boolean {
  const host = new URL(url).hostname;
  return source === 'youtube' ? ['youtube.com', 'youtu.be'].some((h) => host === h || host.endsWith(`.${h}`))
    : host === `${source}.com` || host.endsWith(`.${source}.com`);
}

function tokenList(env: Env): string[] {
  const values = Object.entries(env as unknown as Record<string, unknown>)
    .filter(([key, value]) => /^GH_TOKEN(_\d+)?$/.test(key) && typeof value === 'string' && value)
    .map(([, value]) => value as string);
  return [...new Set(values)].sort((a, b) => Number((cooldown.get(a) ?? 0) > Date.now()) - Number((cooldown.get(b) ?? 0) > Date.now()));
}
async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v as T;
  const value = await fn();
  memo.set(key, { t: Date.now(), v: value });
  return value;
}
type RecaptchaVerdict = { success?: boolean; score?: number; action?: string; hostname?: string };
async function verifyRecaptcha(secret: string, token: string, ip: string): Promise<RecaptchaVerdict | null> {
  if (!token) return null;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body });
  if (!response.ok) return null;
  return await response.json() as RecaptchaVerdict;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = new URL(env.ALLOWED_ORIGIN).origin;
    const hostname = new URL(origin).hostname;
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const gh = async (path: string, init: RequestInit = {}) => {
      let last: Response | null = null;
      for (const token of tokenList(env)) {
        const response = await fetch(`https://api.github.com/repos/${env.GH_REPO}${path}`, {
          ...init,
          headers: {
            ['Authorization']: 'Bearer ' + token,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'dlp-cloud',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
        if (![401, 403, 429].includes(response.status)) return response;
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        cooldown.set(token, reset > Date.now() ? reset : Date.now() + 600000);
        last = response;
      }
      return last ?? new Response(null, { status: 500 });
    };
    try {
      const { pathname } = new URL(req.url);
      if (req.method === 'POST' && pathname === '/api/jobs') {
        const body = await req.json().catch(() => null) as Record<string, unknown> | null;
        const source = String(body?.source ?? '');
        const mode = body?.mode === 'audio' ? 'audio' : 'video';
        const url = normalizeUrl(String(body?.url ?? '').trim());
        const format = String(body?.format ?? '');
        const quality = String(body?.quality ?? 'best');
        if (!url || !['youtube', 'bilibili', 'instagram'].includes(source) || !sourceMatches(url, source)
          || !(FORMATS[mode] as readonly string[]).includes(format) || !QUALITIES.includes(quality)) return json({ error: 'invalid' }, 400);
        const ip = req.headers.get('CF-Connecting-IP') ?? '';
        const v2Token = String(body?.v2_token ?? '');
        if (v2Token) {
          const v2 = await verifyRecaptcha(env.RECAPTCHA_V2_SECRET, v2Token, ip);
          if (v2?.success !== true || (v2.hostname && v2.hostname !== hostname)) return json({ error: 'captcha' }, 403);
        } else {
          const v3 = await verifyRecaptcha(env.RECAPTCHA_V3_SECRET, String(body?.v3_token ?? ''), ip);
          if (v3?.success !== true || v3.action !== 'download' || (v3.score ?? 0) < 0.7
            || (v3.hostname && v3.hostname !== hostname)) return json({ error: 'need_v2' }, 403);
        }
        const jobId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const response = await gh('/actions/workflows/download.yml/dispatches', {
          method: 'POST',
          body: JSON.stringify({ ref: 'main', inputs: { job_id: jobId, url, mode, format, quality, playlist: body?.playlist ? 'true' : 'false' } }),
        });
        if (response.status !== 204) return json({ error: 'dispatch' }, 502);
        return json({ jobId });
      }
      const match = pathname.match(/^\/api\/jobs\/([a-f0-9]{12})$/);
      if (req.method === 'GET' && match) {
        const id = match[1];
        return json(await cached(`job:${id}`, 4000, async () => {
          const runsResponse = await gh('/actions/workflows/download.yml/runs?event=workflow_dispatch&per_page=40');
          if (!runsResponse.ok) throw new Error('runs');
          const runs = await runsResponse.json() as { workflow_runs?: Array<any> };
          const run = runs.workflow_runs?.find((item) => item.name === `job ${id}`);
          if (!run) return { state: 'queued', stage: 0 };
          if (run.status !== 'completed') {
            const jobsResponse = await gh(`/actions/runs/${run.id}/jobs`);
            const jobs = await jobsResponse.json() as { jobs?: Array<{ steps?: Array<any> }> };
            const steps = jobs.jobs?.[0]?.steps ?? [];
            const stage = STEPS.findIndex((name) => steps.find((step) => step.name === name)?.status !== 'completed');
            return { state: 'running', stage: stage < 0 ? STEPS.length - 1 : stage };
          }
          if (run.conclusion !== 'success') return { state: 'failed', logs: run.html_url };
          const release = await gh(`/releases/tags/job-${id}`);
          if (release.status === 404) return { state: 'expired' };
          if (!release.ok) throw new Error('release');
          const data = await release.json() as { assets?: Array<{ name: string; size: number; browser_download_url: string }> };
          const files = (data.assets ?? []).map((asset) => ({ name: asset.name, size: asset.size, url: asset.browser_download_url }));
          return files.length ? { state: 'done', stage: 3, files } : { state: 'expired' };
        }));
      }
      return json({ error: 'not_found' }, 404);
    } catch {
      return json({ error: 'server' }, 500);
    }
  },
};
