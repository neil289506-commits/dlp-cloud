const I18N = {
  zh: {
    title: '貼上連結，雲端幫你下載。',
    lead: '支援 YouTube、bilibili、Instagram 的單支影片、播放清單與純音訊。檔案在 GitHub 雲端主機上轉檔，完成後提供下載連結。',
    url: '影片連結', hint: 'YouTube：youtu.be/ID 或 watch?v=ID｜bilibili：bilibili.com/video/BV…｜Instagram：/p/、/reel/、/tv/ 貼文', type: '類型', video: '影片', audio: '只要音訊',
    lead: '支援單支影片、播放清單與純音訊。檔案在 GitHub 雲端主機上轉檔，完成後提供下載連結。',
    url: 'YouTube 連結', type: '類型', video: '影片', audio: '只要音訊',
    format: '格式', quality: '最高畫質', best: '最高',
    playlist: '這是播放清單，下載全部（打包成 ZIP）',
    go: '開始下載', s1: '準備工具（yt-dlp、ffmpeg、ffprobe）', s2: '下載與轉檔', s3: '打包上傳', s4: '完成，可以下載',
    note: '請只下載你有權下載的內容。檔案會在數小時後自動刪除。',
    errInvalid: '不支援這個連結。請貼 YouTube、bilibili 影片，或 Instagram 貼文／Reels 的連結。',
    errCaptchaLoad: '無法載入 reCAPTCHA，請關閉廣告攔截或換個網路再試。',
    expired: '檔案已過期並被刪除，請重新下載。',
    errCaptcha: '請先勾選「我不是機器人」。',
    errNeedV2: '為了確認你是真人，請勾選下方「我不是機器人」後再按一次。',
    errServer: '無法啟動任務，請稍後再試。', errTimeout: '等待逾時，請稍後再試。',
    failed: '下載失敗。可能是影片不可用、需要登入，或網站擋掉了雲端主機。', logs: '查看執行紀錄', other: 'English',
  },
  en: {
    title: 'Paste a link. The cloud downloads it.',
    lead: 'Single videos, playlists and audio only, from YouTube, bilibili and Instagram. Files are converted on a GitHub cloud runner, then you get a download link.',
    url: 'Video URL', hint: 'YouTube: youtu.be/ID or watch?v=ID | bilibili: bilibili.com/video/BV… | Instagram: /p/, /reel/, /tv/ posts', type: 'Type', video: 'Video', audio: 'Audio only',
    errInvalid: '連結或選項無效，請確認是 YouTube 連結。',
    errCaptcha: '請先完成人機驗證。', errServer: '無法啟動任務，請稍後再試。', errTimeout: '等待逾時，請稍後再試。',
    failed: '下載失敗。可能是影片不可用，或 YouTube 擋掉了雲端主機。', logs: '查看執行紀錄', other: 'English',
  },
  en: {
    title: 'Paste a link. The cloud downloads it.',
    lead: 'Single videos, playlists and audio only. Files are converted on a GitHub cloud runner, then you get a download link.',
    url: 'YouTube URL', type: 'Type', video: 'Video', audio: 'Audio only',
    format: 'Format', quality: 'Max quality', best: 'Best',
    playlist: 'This is a playlist, download everything (as a ZIP)',
    go: 'Download', s1: 'Prepare tools (yt-dlp, ffmpeg, ffprobe)', s2: 'Download and convert', s3: 'Package and upload', s4: 'Done, ready to download',
    note: 'Only download content you have the right to download. Files are deleted automatically after a few hours.',
    errInvalid: 'Unsupported link. Paste a YouTube or bilibili video, or an Instagram post/Reel.',
    errCaptchaLoad: 'Could not load reCAPTCHA. Disable your ad blocker or try another network.',
    expired: 'The file has expired and was deleted. Please download again.',
    errCaptcha: 'Please tick "I\u2019m not a robot" first.',
    errNeedV2: 'To confirm you are human, please tick "I\u2019m not a robot" below and press the button again.',
    errServer: 'Could not start the job. Please try again later.', errTimeout: 'Timed out. Please try again later.',
    failed: 'Download failed. The video may be unavailable, need a login, or the site blocked the cloud runner.', logs: 'View run log', other: '中文',
    errInvalid: 'Invalid link or options. Please check it is a YouTube URL.',
    errCaptcha: 'Please complete the human check first.', errServer: 'Could not start the job. Please try again later.', errTimeout: 'Timed out. Please try again later.',
    failed: 'Download failed. The video may be unavailable, or YouTube blocked the cloud runner.', logs: 'View run log', other: '中文',
  },
};
const FORMATS = { video: ['mp4', 'mkv', 'webm'], audio: ['mp3', 'm4a', 'opus', 'flac', 'wav'] };
const $ = (id) => document.getElementById(id);
const form = $('form'), fmt = $('format'), go = $('go'), err = $('err');
let timer = null, lang = 'zh', failedState = null;
let v2Token = '', v2Id = null, v2Needed = false;

try {
  const saved = localStorage.getItem('lang');
  lang = saved || ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');
} catch { lang = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'; }
let timer = null, lang = 'zh', failedState = null, tsToken = '', tsId = null;

// Cloudflare Turnstile (explicit render, called by the api.js onload hook)
window.onTs = () => {
  tsId = turnstile.render('#ts', {
    sitekey: window.TURNSTILE_SITE_KEY, theme: 'auto',
    callback: (tok) => { tsToken = tok; },
    'expired-callback': () => { tsToken = ''; },
    'error-callback': () => { tsToken = ''; },
  });
};
const resetCaptcha = () => { tsToken = ''; if (tsId !== null) turnstile.reset(tsId); };

try { lang = localStorage.getItem('lang') || (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'; } catch { /* storage unavailable */ }
try { const s = localStorage.getItem('lang'); if (s) lang = s; } catch { /* ignore */ }
const t = (k) => I18N[lang][k];

function applyLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('lang').textContent = t('other');
  if (failedState) renderFailed();
  if (!err.hidden && err.dataset.key) err.textContent = t(err.dataset.key);
}
$('lang').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('lang', lang); } catch { /* ignore */ }
  applyLang();
});

function syncMode() {
  const mode = form.mode.value;
  fmt.innerHTML = FORMATS[mode].map((f) => `<option value="${f}">${f.toUpperCase()}</option>`).join('');
  $('qwrap').hidden = mode === 'audio';
  form.querySelector('.row').classList.toggle('audio-only', mode === 'audio');
}
form.addEventListener('change', (e) => { if (e.target.name === 'mode') syncMode(); });

function showStage(stage) {
  [...$('stages').children].forEach((li, i) => { li.className = i < stage ? 'done' : i === stage ? 'now' : ''; });
}
const mb = (n) => (n / 1048576).toFixed(n > 1.07e8 ? 0 : 1) + ' MB';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(path, init) {
  const base = String(window.API_BASE).replace(/\/+$/, '');
  const r = await fetch(base + path, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('api'); e.status = r.status; e.code = data.error || ''; throw e; }
  if (!r.ok) { const e = new Error('api'); e.status = r.status; throw e; }
  return data;
}
function fail(key) { err.dataset.key = key; err.textContent = t(key); err.hidden = false; go.disabled = false; }
function renderFailed() {
  $('result').innerHTML = `<p class="bad">${esc(t('failed'))} <a href="${esc(failedState)}" target="_blank" rel="noopener">${esc(t('logs'))}</a></p>`;
}

/* ---- reCAPTCHA: v3 runs silently when downloading; the v2 checkbox appears only if the v3 score is too low ---- */
const rc = document.createElement('script');
rc.src = 'https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(window.RECAPTCHA_V3_SITE_KEY);
rc.async = true; rc.defer = true;
document.head.appendChild(rc);
const getV3 = () => new Promise((res, rej) =>
  grecaptcha.ready(() => grecaptcha.execute(window.RECAPTCHA_V3_SITE_KEY, { action: 'download' }).then(res, rej)));
function showV2() {
  v2Needed = true; $('rc2').hidden = false;
  if (v2Id !== null) return;
  v2Id = grecaptcha.render('rc2', {
    sitekey: window.RECAPTCHA_V2_SITE_KEY,
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    callback: (tok) => { v2Token = tok; },
    'expired-callback': () => { v2Token = ''; },
    'error-callback': () => { v2Token = ''; },
  });
}

function poll(jobId, started) {
  clearInterval(timer);
  timer = setInterval(async () => {
    try {
      const s = await api('/api/jobs/' + jobId);
      if (s.state === 'done') {
        clearInterval(timer); showStage(4);
        $('result').innerHTML = s.files.map((f) =>
          `<a class="file" href="${esc(f.url)}"><span>${esc(f.name)}</span><em>${mb(f.size)}</em></a>`).join('');
        go.disabled = false;
      } else if (s.state === 'failed') {
        clearInterval(timer); failedState = s.logs; renderFailed(); go.disabled = false;
      } else if (s.state === 'expired') {
        clearInterval(timer); $('result').innerHTML = `<p class="bad">${esc(t('expired'))}</p>`; go.disabled = false;
      } else { showStage(s.stage ?? 0); }
      if (Date.now() - started > 100 * 60 * 1000) { clearInterval(timer); fail('errTimeout'); }
    } catch { /* transient network error: keep polling */ }
  }, 5000);
      } else { showStage(s.stage ?? 0); }
      if (Date.now() - started > 100 * 60 * 1000) { clearInterval(timer); fail('errTimeout'); }
    } catch { /* transient network error: keep polling */ }
  }, 4000);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.hidden = true; err.dataset.key = ''; failedState = null; $('result').innerHTML = '';
  if (typeof grecaptcha === 'undefined') { fail('errCaptchaLoad'); return; }
  if (v2Needed && !v2Token) { fail('errCaptcha'); return; }
  go.disabled = true;
  try {
    const captcha = v2Needed ? { v2_token: v2Token } : { v3_token: await getV3() };
    const { jobId } = await api('/api/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: $('url').value.trim(), mode: form.mode.value, format: fmt.value,
        quality: $('quality').value, playlist: $('playlist').checked, ...captcha }),
  if (!tsToken) { fail('errCaptcha'); return; }
  go.disabled = true;
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: $('url').value.trim(), mode: form.mode.value, format: fmt.value,
        quality: $('quality').value, playlist: $('playlist').checked, cf_token: tsToken }),
    });
    $('job').hidden = false; showStage(0);
    $('job').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    poll(jobId, Date.now());
  } catch (x) {
    if (x.code === 'need_v2') { showV2(); fail('errNeedV2'); }
    else if (x.code === 'captcha') fail('errCaptcha');
    else fail(x.status === 400 ? 'errInvalid' : 'errServer');
  } finally {
    v2Token = ''; if (v2Id !== null) grecaptcha.reset(v2Id);
  }
  } catch (x) { fail(x.status === 400 ? 'errInvalid' : x.status === 403 ? 'errCaptcha' : 'errServer'); }
  finally { resetCaptcha(); }
});

syncMode();
applyLang();
