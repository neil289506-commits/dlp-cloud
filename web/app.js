const I18N = {
  zh: {
    title: '貼上連結，雲端幫你下載。',
    lead: '支援 YouTube、bilibili、Instagram 的影片、播放清單與純音訊。',
    source: '下載來源', youtube: 'YouTube', bilibili: 'bilibili', instagram: 'Instagram',
    url: '影片連結', hint: '請貼上所選來源的影片連結。',
    type: '類型', video: '影片', audio: '只要音訊', format: '格式', quality: '最高畫質', best: '最高',
    playlist: '這是播放清單，下載全部（打包成 ZIP）', go: '開始下載',
    s1: '準備工具（yt-dlp、ffmpeg、ffprobe）', s2: '下載與轉檔', s3: '打包上傳', s4: '完成，可以下載',
    note: '請只下載你有權下載的內容。檔案會在數小時後自動刪除。',
    errInvalid: '不支援這個連結，或連結與所選來源不符。',
    errCaptchaLoad: 'reCAPTCHA 尚未載入，請重新整理頁面或稍後再試。',
    errCaptcha: '請先完成人機驗證。', errNeedV2: '請完成下方「我不是機器人」驗證後再按一次。',
    expired: '檔案已過期並被刪除，請重新下載。',
    errServer: '無法啟動任務，請稍後再試。', errTimeout: '等待逾時，請稍後再試。',
    failed: '下載失敗。可能是影片不可用、需要登入，或網站擋掉了雲端主機。', logs: '查看執行紀錄', other: 'English',
  },
  en: {
    title: 'Paste a link. The cloud downloads it.',
    lead: 'Download videos, playlists and audio from YouTube, bilibili and Instagram.',
    source: 'Download source', youtube: 'YouTube', bilibili: 'bilibili', instagram: 'Instagram',
    url: 'Video URL', hint: 'Paste a URL from the selected source.',
    type: 'Type', video: 'Video', audio: 'Audio only', format: 'Format', quality: 'Max quality', best: 'Best',
    playlist: 'This is a playlist, download everything (as a ZIP)', go: 'Download',
    s1: 'Prepare tools (yt-dlp, ffmpeg, ffprobe)', s2: 'Download and convert', s3: 'Package and upload', s4: 'Done, ready to download',
    note: 'Only download content you have the right to download. Files are deleted automatically after a few hours.',
    errInvalid: 'Unsupported link, or the link does not match the selected source.',
    errCaptchaLoad: 'reCAPTCHA has not loaded. Refresh the page and try again.',
    errCaptcha: 'Please complete the human check first.', errNeedV2: 'Complete the "I am not a robot" check below, then press Download again.',
    expired: 'The file has expired and was deleted. Please download again.',
    errServer: 'Could not start the job. Please try again later.', errTimeout: 'Timed out. Please try again later.',
    failed: 'Download failed. The video may be unavailable, need a login, or the site blocked the cloud runner.', logs: 'View run log', other: '中文',
  },
};
const FORMATS = { video: ['mp4', 'mkv', 'webm'], audio: ['mp3', 'm4a', 'opus', 'flac', 'wav'] };
const $ = (id) => document.getElementById(id);
const form = $('form'), source = $('source'), fmt = $('format'), go = $('go'), err = $('err');
let timer = null, lang = 'zh', failedState = null, v3Token = '', v2Token = '', v2Id = null, v2Needed = false;

try { lang = localStorage.getItem('lang') || ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'); } catch {}
const t = (key) => I18N[lang][key];

function recaptchaReady() {
  return typeof grecaptcha !== 'undefined' && typeof grecaptcha.ready === 'function';
}
function showV2() {
  v2Needed = true;
  $('rc2').hidden = false;
  if (v2Id !== null) return;
  if (!recaptchaReady()) return;
  v2Id = grecaptcha.render('rc2', {
    sitekey: window.RECAPTCHA_V2_SITE_KEY,
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    callback: (token) => { v2Token = token; },
    'expired-callback': () => { v2Token = ''; },
    'error-callback': () => { v2Token = ''; },
  });
}
function resetCaptcha() {
  v3Token = ''; v2Token = '';
  if (v2Id !== null && recaptchaReady()) grecaptcha.reset(v2Id);
}
function applyLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('lang').textContent = t('other');
  if (failedState) renderFailed();
  if (!err.hidden && err.dataset.key) err.textContent = t(err.dataset.key);
}
$('lang').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('lang', lang); } catch {}
  applyLang();
});
function syncMode() {
  const mode = form.mode.value;
  fmt.innerHTML = FORMATS[mode].map((f) => `<option value="${f}">${f.toUpperCase()}</option>`).join('');
  $('qwrap').hidden = mode === 'audio';
  form.querySelector('.row').classList.toggle('audio-only', mode === 'audio');
}
function syncSource() {
  const isInstagram = source.value === 'instagram';
  $('playlist-wrap').hidden = isInstagram;
  if (isInstagram) $('playlist').checked = false;
  $('url').placeholder = source.value === 'youtube' ? 'https://www.youtube.com/watch?v='
    : source.value === 'bilibili' ? 'https://www.bilibili.com/video/BV...' : 'https://www.instagram.com/reel/...';
}
form.addEventListener('change', (e) => {
  if (e.target.name === 'mode') syncMode();
  if (e.target.id === 'source') syncSource();
});
function showStage(stage) {
  [...$('stages').children].forEach((li, i) => { li.className = i < stage ? 'done' : i === stage ? 'now' : ''; });
}
const mb = (n) => (n / 1048576).toFixed(n > 1.07e8 ? 0 : 1) + ' MB';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function api(path, init) {
  const r = await fetch(String(window.API_BASE).replace(/\/+$/, '') + path, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('api'); e.status = r.status; e.code = data.error || ''; throw e; }
  return data;
}
function fail(key) { err.dataset.key = key; err.textContent = t(key); err.hidden = false; go.disabled = false; }
function renderFailed() {
  $('result').innerHTML = `<p class="bad">${esc(t('failed'))} <a href="${esc(failedState)}" target="_blank" rel="noopener">${esc(t('logs'))}</a></p>`;
}
function poll(jobId, started) {
  clearInterval(timer);
  timer = setInterval(async () => {
    try {
      const s = await api('/api/jobs/' + jobId);
      if (s.state === 'done') {
        clearInterval(timer); showStage(4);
        $('result').innerHTML = s.files.map((f) => `<a class="file" href="${esc(f.url)}"><span>${esc(f.name)}</span><em>${mb(f.size)}</em></a>`).join('');
        go.disabled = false;
      } else if (s.state === 'failed') {
        clearInterval(timer); failedState = s.logs; renderFailed(); go.disabled = false;
      } else if (s.state === 'expired') {
        clearInterval(timer); $('result').innerHTML = `<p class="bad">${esc(t('expired'))}</p>`; go.disabled = false;
      } else showStage(s.stage ?? 0);
      if (Date.now() - started > 100 * 60 * 1000) { clearInterval(timer); fail('errTimeout'); }
    } catch {}
  }, 5000);
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.hidden = true; err.dataset.key = ''; failedState = null; $('result').innerHTML = '';
  if (!recaptchaReady()) { fail('errCaptchaLoad'); return; }
  if (v2Needed && !v2Token) { fail('errCaptcha'); return; }
  go.disabled = true;
  try {
    if (!v2Needed) {
      v3Token = await new Promise((resolve, reject) => {
        grecaptcha.ready(() => grecaptcha.execute(window.RECAPTCHA_V3_SITE_KEY, { action: 'download' }).then(resolve, reject));
      });
    }
    const { jobId } = await api('/api/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: $('url').value.trim(), source: source.value, mode: form.mode.value, format: fmt.value,
        quality: $('quality').value, playlist: $('playlist').checked,
        ...(v2Needed ? { v2_token: v2Token } : { v3_token: v3Token }),
      }),
    });
    $('job').hidden = false; showStage(0);
    $('job').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    poll(jobId, Date.now());
  } catch (x) {
    if (x.code === 'need_v2') { showV2(); fail('errNeedV2'); }
    else fail(x.status === 400 ? 'errInvalid' : x.status === 403 ? 'errCaptcha' : 'errServer');
  } finally {
    resetCaptcha();
  }
});
syncMode(); syncSource(); applyLang();
