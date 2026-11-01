# dlp-cloud

中文在前，English below.

## 中文
純前端網頁 + Cloudflare Worker + GitHub Actions Windows Runner。

```
瀏覽器 (GitHub Pages) → Turnstile 人機驗證 → Worker (藏 token、驗證輸入) → workflow_dispatch
  → windows-latest：下載 yt-dlp / ffmpeg / ffprobe，啟動 PO token 服務 → 下載、轉檔 → 發佈成臨時 Release
瀏覽器每 4 秒查進度 → 完成後顯示下載連結 → cleanup.yml 每 6 小時（或手動）刪除全部臨時檔案
```

### 部署
1. 建立 **公開** repo `neil289506-commits/dlp-cloud`，推上全部檔案，預設分支 `main`。Settings → Pages → Source 選 **GitHub Actions**。
2. 建 fine-grained PAT，只授權此 repo：**Actions: Read and write**、**Contents: Read**。
3. 到 Cloudflare 建 Turnstile 小工具（Hostname 填 `neil289506-commits.github.io`），取得 Site key 與 Secret key。
4. `cd worker && npm i`，然後：
   ```
   npx wrangler secret put GH_TOKEN
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler deploy
   ```
5. 編輯 `web/config.js`：`API_BASE` 填 Worker 網址（結尾不要斜線），`TURNSTILE_SITE_KEY` 填 Site key。Push 後網站上線。
6. 建議在 Cloudflare 對 Worker 加 Rate Limiting。

### 常見問題
- **YouTube 要求登入／判定機器人**：workflow 已自動啟動 PO token 服務（bgutil-ytdlp-pot-provider），不保證永遠有效。仍被擋時，把瀏覽器匯出的 `cookies.txt` 存成 repo secret `YT_COOKIES`（建議用專用帳號）。
- PO token 步驟失敗不會中斷下載，只是少了這層保護。
- 連結要用 `youtu.be/ID` 或 `youtube.com/watch?v=ID` 格式。
- 單檔上限 2 GB（Release 限制）；播放清單會打包成 ZIP。
- 請只下載你有權下載的內容，並遵守 YouTube 服務條款與當地法律。

## English
Static web page + Cloudflare Worker + GitHub Actions Windows runner.

```
Browser (GitHub Pages) → Turnstile check → Worker (hides the token, validates input) → workflow_dispatch
  → windows-latest: fetch yt-dlp / ffmpeg / ffprobe, start the PO token server → download and convert → publish a temporary Release
Browser polls every 4 s → shows the download link → cleanup.yml deletes all temporary files every 6 hours (or manually)
```

### Deploy
1. Create the **public** repo `neil289506-commits/dlp-cloud`, push everything, default branch `main`. Settings → Pages → Source: **GitHub Actions**.
2. Create a fine-grained PAT for this repo only: **Actions: Read and write**, **Contents: Read**.
3. Create a Cloudflare Turnstile widget (hostname `neil289506-commits.github.io`) to get a Site key and a Secret key.
4. `cd worker && npm i`, then run `npx wrangler secret put GH_TOKEN`, `npx wrangler secret put TURNSTILE_SECRET`, `npx wrangler deploy`.
5. Edit `web/config.js`: set `API_BASE` to the Worker URL (no trailing slash) and `TURNSTILE_SITE_KEY` to the Site key. Push to publish.
6. Add Cloudflare Rate Limiting for the Worker.

### FAQ
- **YouTube asks to sign in / flags a bot**: the workflow starts a PO token server (bgutil-ytdlp-pot-provider); it is not guaranteed to keep working. If still blocked, save an exported `cookies.txt` as the repo secret `YT_COOKIES` (use a dedicated account).
- A failing PO token step does not stop the download; you just lose that extra protection.
- Use `youtu.be/ID` or `youtube.com/watch?v=ID` links.
- 2 GB per file (Release limit); playlists are zipped.
- Only download content you have the right to, and follow YouTube's terms and local law.

## License
Copyleft by MIT License｜以 MIT 授權條款釋出。 See `LICENSE`.
