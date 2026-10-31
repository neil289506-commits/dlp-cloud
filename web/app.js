const FORMATS = { video: ['mp4', 'mkv', 'webm'], audio: ['mp3', 'm4a', 'opus', 'flac', 'wav'] };
const $ = (id) => document.getElementById(id);
const form = $('form'), fmt = $('format'), go = $('go'), err = $('err');
let timer = null;

function syncMode() {
  const mode = form.mode.value;
  fmt.innerHTML = FORMATS[mode].map((f) => `<option value="${f}">${f.toUpperCase()}</option>`).join('');
  $('qwrap').hidden = mode === 'audio';
  form.querySelector('.row').classList.toggle('audio-only', mode === 'audio');
}
form.addEventListener('change', (e) => { if (e.target.name === 'mode') syncMode(); });
syncMode();

function showStage(stage) {
  [...$('stages').children].forEach((li, i) => {
    li.className = i < stage ? 'done' : i === stage ? 'now' : '';
  });
}
const mb = (n) => (n / 1048576).toFixed(n > 1.07e8 ? 0 : 1) + ' MB';
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(path, init) {
  const r = await fetch(window.API_BASE + path, init);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || '發生錯誤');
  return data;
}

function fail(msg) { err.textContent = msg; err.hidden = false; go.disabled = false; }

function poll(jobId, started) {
  clearInterval(timer);
  timer = setInterval(async () => {
    try {
      const s = await api('/api/jobs/' + jobId);
      if (s.state === 'done') {
        clearInterval(timer);
        showStage(4);
        $('result').innerHTML = s.files.map((f) =>
          `<a class="file" href="${esc(f.url)}"><span>${esc(f.name)}</span><em>${mb(f.size)}</em></a>`).join('');
        go.disabled = false;
      } else if (s.state === 'failed') {
        clearInterval(timer);
        $('result').innerHTML = `<p class="bad">下載失敗。可能是影片不可用，或 YouTube 擋掉了雲端主機。<a href="${esc(s.logs)}" target="_blank" rel="noopener">查看執行紀錄</a></p>`;
        go.disabled = false;
      } else {
        showStage(s.stage ?? 0);
      }
      if (Date.now() - started > 100 * 60 * 1000) { clearInterval(timer); fail('等待逾時'); }
    } catch { /* transient network error: keep polling */ }
  }, 4000);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.hidden = true; go.disabled = true; $('result').innerHTML = '';
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: $('url').value.trim(), mode: form.mode.value, format: fmt.value,
        quality: $('quality').value, playlist: $('playlist').checked,
      }),
    });
    $('job').hidden = false; showStage(0);
    $('job').scrollIntoView({ behavior: 'smooth', block: 'center' });
    poll(jobId, Date.now());
  } catch (x) { fail(x.message); }
});
