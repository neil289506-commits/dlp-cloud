# dlp-cloud

中文在前，English below.

## 中文
純前端網頁 + Cloudflare Worker + GitHub Actions Windows Runner。

```
瀏覽器 (GitHub Pages) → Cloudflare 安全驗證（進站）→ reCAPTCHA v3（下載；分數低於 0.7 改用 v2）→ Worker (藏 token、驗證輸入) → workflow_dispatch
  → windows-latest：下載 yt-dlp / ffmpeg / ffprobe，啟動 PO token 服務 → 下載、轉檔 → 發佈成臨時 Release
瀏覽器每 4 秒查進度 → 完成後顯示下載連結 → cleanup.yml 每 6 小時（或手動）刪除全部臨時檔案
```

### 部署
1. 建立 **公開** repo `neil289506-commits/dlp-cloud`，推上全部檔案，預設分支 `main`。Settings → Pages → Source 選 **GitHub Actions**。
2. 建 fine-grained PAT，只授權此 repo：**Actions: Read and write**、**Contents: Read**。
3. 到 Google reCAPTCHA 後台建立兩把金鑰（網域填 `neil289506-commits.github.io`）：一把 **v3**、一把 **v2「我不是機器人」核取方塊**，各有 Site key 與 Secret key。
4. `cd worker && npm i`，然後：
   ```
   npx wrangler secret put GH_TOKEN
   npx wrangler secret put RECAPTCHA_V3_SECRET
   npx wrangler secret put RECAPTCHA_V2_SECRET
   npx wrangler deploy
   ```
5. 編輯 `web/config.js`：`API_BASE` 填 Worker 網址（結尾不要斜線），`RECAPTCHA_V3_SITE_KEY`、`RECAPTCHA_V2_SITE_KEY` 填兩把 Site key。Push 後網站上線。
6. 建議在 Cloudflare 對 Worker 加 Rate Limiting。

### 進站的 Cloudflare 安全驗證（需要自己的網域）
1. 網域加入 Cloudflare（免費方案即可），DNS 新增 `CNAME dl → neil289506-commits.github.io`；repo Settings → Pages → Custom domain 填 `dl.你的網域`。建議先用「僅 DNS」讓 GitHub 發好 HTTPS 憑證，再切成 Proxied（橘雲），SSL/TLS 模式選 Full。
2. Security → WAF → Custom rules：Hostname 等於 `dl.你的網域` → 動作選 **Managed Challenge**。
3. 把 `wrangler.toml` 的 `ALLOWED_ORIGIN` 改成 `https://dl.你的網域`，重新部署 Worker；reCAPTCHA 兩把金鑰的網域清單也加入這個網域。
4. Worker 維持 `workers.dev` 網址，不要被這條規則挑戰，否則網頁的 API 請求會失敗。

### 用 GitHub Actions 自動部署 Worker
repo secrets 新增 `CLOUDFLARE_API_TOKEN`（Cloudflare → My Profile → API Tokens → 範本 "Edit Cloudflare Workers"）與 `CLOUDFLARE_ACCOUNT_ID`。之後 `worker/` 有變動並 push 到 `main` 就會自動部署（`deploy-worker.yml`）。Worker 的 `GH_TOKEN_1`…`GH_TOKEN_5`（或單一 `GH_TOKEN`）、`RECAPTCHA_V3_SECRET`、`RECAPTCHA_V2_SECRET` 仍在 Cloudflare 後台設定一次即可，部署不會清掉它們。若同時連動了 Workers Builds，請先中斷，避免重複部署。

### 常見問題
- **YouTube 要求登入／判定機器人**：workflow 已自動啟動 PO token 服務（bgutil-ytdlp-pot-provider），不保證永遠有效。仍被擋時，把瀏覽器匯出的 `cookies.txt` 存成 repo secret `YT_COOKIES`（建議用專用帳號）。
- PO token 步驟失敗不會中斷下載，只是少了這層保護。
- 支援 YouTube、bilibili（`bilibili.com/video/BV…`）、Instagram（`/p/`、`/reel/`、`/tv/`）。bilibili 有地區限制的影片、Instagram 多數貼文，在 GitHub 的美國機房通常需要登入 cookies：分別存成 repo secret `BILI_COOKIES`、`IG_COOKIES`（Netscape 格式，建議專用帳號）。
- 單檔上限 2 GB（Release 限制）；播放清單會打包成 ZIP。
- 請只下載你有權下載的內容，並遵守 YouTube 服務條款與當地法律。

## English
Static web page + Cloudflare Worker + GitHub Actions Windows runner.

```
Browser (GitHub Pages) → Cloudflare security challenge (entry) → reCAPTCHA v3 (download; v2 if score < 0.7) → Worker (hides the token, validates input) → workflow_dispatch
  → windows-latest: fetch yt-dlp / ffmpeg / ffprobe, start the PO token server → download and convert → publish a temporary Release
Browser polls every 4 s → shows the download link → cleanup.yml deletes all temporary files every 6 hours (or manually)
```

### Deploy
1. Create the **public** repo `neil289506-commits/dlp-cloud`, push everything, default branch `main`. Settings → Pages → Source: **GitHub Actions**.
2. Create a fine-grained PAT for this repo only: **Actions: Read and write**, **Contents: Read**.
3. In the Google reCAPTCHA console create two keys for `neil289506-commits.github.io`: one **v3** and one **v2 "I'm not a robot" checkbox**, each with a Site key and a Secret key.
4. `cd worker && npm i`, then run `npx wrangler secret put GH_TOKEN`, `npx wrangler secret put RECAPTCHA_V3_SECRET`, `npx wrangler secret put RECAPTCHA_V2_SECRET`, `npx wrangler deploy`.
5. Edit `web/config.js`: set `API_BASE` to the Worker URL (no trailing slash) and `RECAPTCHA_V3_SITE_KEY` and `RECAPTCHA_V2_SITE_KEY` to the two Site keys. Push to publish.
6. Add Cloudflare Rate Limiting for the Worker.

### Cloudflare challenge on entry (needs your own domain)
1. Add your domain to Cloudflare (free plan is fine) and create `CNAME dl → neil289506-commits.github.io`; set Pages → Custom domain to `dl.your-domain`. Use DNS-only first so GitHub can issue the HTTPS certificate, then switch to Proxied; set SSL/TLS to Full.
2. Security → WAF → Custom rules: Hostname equals `dl.your-domain` → action **Managed Challenge**.
3. Change `ALLOWED_ORIGIN` in `wrangler.toml` to `https://dl.your-domain`, redeploy the Worker, and add the domain to both reCAPTCHA keys.
4. Keep the Worker on its `workers.dev` URL so the rule does not challenge the page's API calls.

### Auto-deploy the Worker with GitHub Actions
Add repo secrets `CLOUDFLARE_API_TOKEN` (Cloudflare → My Profile → API Tokens → "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`. Pushes to `main` that touch `worker/` then deploy automatically (`deploy-worker.yml`). The Worker secrets (`GH_TOKEN`, `RECAPTCHA_V3_SECRET`, `RECAPTCHA_V2_SECRET`) are set once in the Cloudflare dashboard and survive deployments. Disconnect Workers Builds if it is also enabled, to avoid double deploys.

### FAQ
- **YouTube asks to sign in / flags a bot**: the workflow starts a PO token server (bgutil-ytdlp-pot-provider); it is not guaranteed to keep working. If still blocked, save an exported `cookies.txt` as the repo secret `YT_COOKIES` (use a dedicated account).
- A failing PO token step does not stop the download; you just lose that extra protection.
- Supported: YouTube, bilibili (`bilibili.com/video/BV…`), Instagram (`/p/`, `/reel/`, `/tv/`). Region-locked bilibili videos and most Instagram posts usually need login cookies from the US runner: save them as the repo secrets `BILI_COOKIES` and `IG_COOKIES` (Netscape format, dedicated accounts recommended).
- 2 GB per file (Release limit); playlists are zipped.
- Only download content you have the right to, and follow YouTube's terms and local law.

## License
Copyleft by MIT License｜以 MIT 授權條款釋出。 See `LICENSE`.
