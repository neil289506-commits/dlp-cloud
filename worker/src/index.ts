/// <reference types="@cloudflare/workers-types" />
interface Env {
  GH_REPO: string; ALLOWED_ORIGIN: string;
  GH_TOKEN?: string; // plus optional GH_TOKEN_1 ... GH_TOKEN_9, picked at random
 
  RECAPTCHA_V3_SECRET: string; RECAPTCHA_V2_SECRET: string;
}

const FORMATS = { video: ['mp4', 'mkv', 'webm'], audio: ['mp3', 'm4a', 'opus', 'flac', 'wav'] } as const;
const QUALITIES = ['best', '2160', '1440', '1080', '720', '480', '360'];
const STEPS = ['Fetch tools', 'Download', 'Package and publish'];
const MIN_SCORE = 0.7; // below this, the user must tick the reCAPTCHA v2 checkbox

/* ---- URL: accept only real YouTube / bilibili / Instagram links and rebuild a clean canonical URL ---- */
const VIDEO_ID = /^[\w-]{11}$/;
const LIST_ID = /^[\w-]{10,64}$/;

function normalizeYouTube(u: URL, host: string, parts: string[]): string | null {
  const list = u.searchParams.get('list') ?? '';
  let id = '';
  if (host === 'youtu.be') {
    id = parts[0] ?? '';
  } else if (host === 'youtube.com') {
    const p = parts[0] ?? '';
    if (p === 'watch') id = u.searchParams.get('v') ?? '';
    else if (p === 'shorts' || p === 'live' || p === 'embed') id = parts[1] ?? '';
    else if (p === 'playlist') return LIST_ID.test(list) ? `https://www.youtube.com/playlist?list=${list}` : null;
  } else return null;
  if (!VIDEO_ID.test(id)) return null;
  const q = new URLSearchParams({ v: id });
  if (LIST_ID.test(list)) q.set('list', list);
  return `https://www.youtube.com/watch?${q}`;
}

function normalizeBilibili(u: URL, parts: string[]): string | null {
  if (parts[0] !== 'video') return null;
  const id = parts[1] ?? '';
  if (!/^(BV[0-9A-Za-z]{10}|av\d{1,12})$/i.test(id)) return null;
  const page = u.searchParams.get('p') ?? '';
  return `https://www.bilibili.com/video/${id}` + (/^\d{1,3}$/.test(page) ? `?p=${page}` : '');
}

function normalizeInstagram(parts: string[]): string | null {
  const i = parts.findIndex((x) => ['p', 'reel', 'reels', 'tv'].includes(x));
  const code = i >= 0 ? parts[i + 1] ?? '' : '';
  if (!/^[\w-]{5,30}$/.test(code)) return null;
  const kind = parts[i] === 'reels' ? 'reel' : parts[i];
  return `https://www.instagram.com/${kind}/${code}/`;
}

function normalizeUrl(input: string): string | null {
  let u: URL;
  try { u = new URL(input); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be' || host === 'youtube.com') return normalizeYouTube(u, host, parts);
  if (host === 'bilibili.com') return normalizeBilibili(u, parts);
  if (host === 'instagram.com') return normalizeInstagram(parts);
  return null;
}

/* ---- several GitHub tokens: random pick, automatic failover when one is rejected or rate limited ---- */
const cooldown = new Map<string, number>(); // token -> time (ms) until which it is skipped
function tokenList(env: Env): string[] {
  const all = Object.entries(env as unknown as Record<string, unknown>)
    .filter(([k, v]) => /^GH_TOKEN(_\d+)?$/.test(k) && typeof v === 'string' && v.length > 0)
    .map(([, v]) => v as string);
  const list = [...new Set(all)];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const ready = list.filter((t) => (cooldown.get(t) ?? 0) <= Date.now());
  return ready.length ? ready : list;
}

/* ---- tiny in-memory cache: keeps many pollers from exhausting the GitHub API rate limit ---- */
const memo = new Map<string, { t: number; v: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v as T;
  const v = await fn();
  memo.set(key, { t: Date.now(), v });
  if (memo.size > 300) memo.delete(memo.keys().next().value as string);
  return v;
}

type Verdict = { success?: boolean; score?: number; action?: string; hostname?: string };
async function siteverify(secret: string, token: string, ip: string): Promise<Verdict | null> {
  if (!token) return null;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const r = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body });
  if (!r.ok) return null;
  return (await r.json()) as Verdict;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Normalise so a trailing slash in ALLOWED_ORIGIN can never break CORS.
    const origin = new URL(env.ALLOWED_ORIGIN).origin;
    const host = new URL(origin).hostname;
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const gh = async (path: string, init: RequestInit = {}): Promise<Response> => {
      let last: Response | null = null;
      for (const token of tokenList(env)) {
        const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'dlp-cloud',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
        if (r.status !== 401 && r.status !== 403 && r.status !== 429) return r;
        // rejected or exhausted: rest this token and try the next one
        const exhausted = r.headers.get('x-ratelimit-remaining') === '0';
        const reset = Number(r.headers.get('x-ratelimit-reset')) * 1000;
        cooldown.set(token, exhausted && reset > Date.now() ? reset : Date.now() + 10 * 60_000);
        last = r;
      }
      return last ?? new Response(null, { status: 500 });
    };
    const ghJson = async (path: string): Promise<any> => {
      const r = await gh(path);
      if (!r.ok) throw new Error(`github ${r.status}`);
      return r.json();
    };

    try {
      const { pathname } = new URL(req.url);
      const ip = req.headers.get('CF-Connecting-IP') ?? '';

      if (req.method === 'POST' && pathname === '/api/jobs') {
        const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
        if (!b || typeof b !== 'object') return json({ error: 'invalid' }, 400);

        const mode = b.mode === 'audio' ? 'audio' : 'video';
        const url = normalizeUrl(String(b.url ?? '').trim());
        const format = String(b.format ?? '');
        const quality = String(b.quality ?? 'best');
        if (!url) return json({ error: 'invalid' }, 400);
        if (!(FORMATS[mode] as readonly string[]).includes(format)) return json({ error: 'invalid' }, 400);
        if (!QUALITIES.includes(quality)) return json({ error: 'invalid' }, 400);

        // reCAPTCHA v3 score first; below MIN_SCORE the client must send a v2 checkbox token instead.
        const v2t = String(b.v2_token ?? '');
        if (v2t) {
          const v2 = await siteverify(env.RECAPTCHA_V2_SECRET, v2t, ip);
          if (!(v2?.success === true && v2.hostname === host)) return json({ error: 'captcha' }, 403);
        } else {
          const v3 = await siteverify(env.RECAPTCHA_V3_SECRET, String(b.v3_token ?? ''), ip);
          const ok = v3?.success === true && v3.action === 'download' && (v3.score ?? 0) >= MIN_SCORE && v3.hostname === host;
          if (!ok) return json({ error: 'need_v2' }, 403);
        }

        const jobId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const r = await gh('/actions/workflows/download.yml/dispatches', {
          method: 'POST',
          body: JSON.stringify({
            ref: 'main',
            inputs: { job_id: jobId, url, mode, format, quality, playlist: b.playlist ? 'true' : 'false' },
          }),
        });
        if (r.status !== 204) return json({ error: 'dispatch' }, 502);
        return json({ jobId });
      }

      const m = pathname.match(/^\/api\/jobs\/([a-f0-9]{12})$/);
      if (req.method === 'GET' && m) {
        const id = m[1];
        const status = await cached(`job:${id}`, 4000, async () => {
          const runs = await cached('runs', 4000, () =>
            ghJson('/actions/workflows/download.yml/runs?event=workflow_dispatch&per_page=40'));
          const run = runs.workflow_runs?.find((x: any) => x.name === `job ${id}`);
          if (!run) return { state: 'queued', stage: 0 };

          if (run.status !== 'completed') {
            const jobs = await ghJson(`/actions/runs/${run.id}/jobs`);
            const steps: any[] = jobs.jobs?.[0]?.steps ?? [];
            const stage = STEPS.findIndex((n) => steps.find((s) => s.name === n)?.status !== 'completed');
            return { state: 'running', stage: stage === -1 ? STEPS.length - 1 : stage };
          }
          if (run.conclusion !== 'success') return { state: 'failed', logs: run.html_url };

          const r = await gh(`/releases/tags/job-${id}`);
          if (r.status === 404) return { state: 'expired' }; // already removed by cleanup
          if (!r.ok) throw new Error(`github ${r.status}`);
          const rel = (await r.json()) as any;
          const files = (rel.assets ?? []).map((a: any) => ({ name: a.name, size: a.size, url: a.browser_download_url }));
          return files.length ? { state: 'done', stage: 3, files } : { state: 'expired' };
        });
        return json(status);
      }
      return json({ error: 'not_found' }, 404);
    } catch {
      return json({ error: 'server' }, 500);
    }
  },
};
