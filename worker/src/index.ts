/// <reference types="@cloudflare/workers-types" />
interface Env { GH_TOKEN: string; GH_REPO: string; ALLOWED_ORIGIN: string; TURNSTILE_SECRET: string }

async function verifyTurnstile(token: string, secret: string, ip: string | null): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  return ((await r.json()) as { success?: boolean }).success === true;
}

const YT = /^https:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\/[\w\-./?=&%#@+]+$/i;
const FORMATS = { video: ['mp4', 'mkv', 'webm'], audio: ['mp3', 'm4a', 'opus', 'flac', 'wav'] } as const;
const QUALITIES = ['best', '2160', '1440', '1080', '720', '480', '360'];
const STEPS = ['Fetch tools', 'Download', 'Package and publish'];

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const gh = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.github.com/repos/${env.GH_REPO}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${env.GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'yt-cloud-dl',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

    try {
      const { pathname } = new URL(req.url);

      if (req.method === 'POST' && pathname === '/api/jobs') {
        const b = (await req.json()) as Record<string, string | boolean>;
        const human = await verifyTurnstile(String(b.cf_token ?? ''), env.TURNSTILE_SECRET, req.headers.get('CF-Connecting-IP'));
        if (!human) return json({ error: 'captcha' }, 403);
        const mode = b.mode === 'audio' ? 'audio' : 'video';
        const url = String(b.url ?? '').trim();
        const format = String(b.format ?? '');
        const quality = String(b.quality ?? 'best');
        if (!YT.test(url)) return json({ error: '請貼上有效的 YouTube 連結' }, 400);
        if (!(FORMATS[mode] as readonly string[]).includes(format)) return json({ error: '不支援的格式' }, 400);
        if (!QUALITIES.includes(quality)) return json({ error: '不支援的畫質' }, 400);

        const jobId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const r = await gh('/actions/workflows/download.yml/dispatches', {
          method: 'POST',
          body: JSON.stringify({
            ref: 'main',
            inputs: { job_id: jobId, url, mode, format, quality, playlist: b.playlist ? 'true' : 'false' },
          }),
        });
        if (r.status !== 204) return json({ error: '無法啟動雲端任務' }, 502);
        return json({ jobId });
      }

      const m = pathname.match(/^\/api\/jobs\/([a-f0-9]{12})$/);
      if (req.method === 'GET' && m) {
        const id = m[1];
        const runs = (await (await gh('/actions/workflows/download.yml/runs?event=workflow_dispatch&per_page=40')).json()) as any;
        const run = runs.workflow_runs?.find((x: any) => x.name === `job ${id}`);
        if (!run) return json({ state: 'queued', stage: 0 });

        if (run.status !== 'completed') {
          const jobs = (await (await gh(`/actions/runs/${run.id}/jobs`)).json()) as any;
          const steps: any[] = jobs.jobs?.[0]?.steps ?? [];
          const stage = STEPS.findIndex((n) => steps.find((s) => s.name === n)?.status !== 'completed');
          return json({ state: 'running', stage: Math.max(stage, 0) });
        }
        if (run.conclusion !== 'success') return json({ state: 'failed', logs: run.html_url });

        const rel = (await (await gh(`/releases/tags/job-${id}`)).json()) as any;
        const files = (rel.assets ?? []).map((a: any) => ({ name: a.name, size: a.size, url: a.browser_download_url }));
        return json({ state: 'done', stage: 3, files });
      }
      return json({ error: 'Not found' }, 404);
    } catch {
      return json({ error: '伺服器錯誤' }, 500);
    }
  },
};
