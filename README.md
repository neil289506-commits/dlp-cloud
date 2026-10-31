# 雲端影片下載器 (yt-cloud-dl)

純前端網頁 + Cloudflare Worker + GitHub Actions Windows Runner。

```
瀏覽器 (GitHub Pages) → Worker (藏 token、驗證輸入) → workflow_dispatch
  → windows-latest 下載 yt-dlp / ffmpeg / ffprobe → 下載、轉檔 → 發佈成臨時 Release
瀏覽器每 4 秒查進度 → 完成後顯示 Release 的下載連結 → cleanup.yml 每小時刪除超過 6 小時的檔案
```

## 部署
1. 建立 **公開** repo，推上全部檔案，預設分支為 `main`。
2. Settings → Pages → Source 選 **GitHub Actions**。
3. 建一個 fine-grained PAT，只授權此 repo：**Actions: Read and write**、**Contents: Read**。
4. `cd worker && npm i && npx wrangler secret put GH_TOKEN && npx wrangler deploy`（先改 `wrangler.toml` 的 `GH_REPO`、`ALLOWED_ORIGIN`）。
5. 把 Worker 網址填進 `web/config.js`，push 後網站就上線。
6. 建議在 Cloudflare 對 Worker 加 Rate Limiting 規則，避免被人刷光 Actions 額度。

## 常見問題
- **YouTube 要求登入／判定機器人**：GitHub 機房 IP 常被擋。把瀏覽器匯出的 `cookies.txt` 內容存成 repo secret `YT_COOKIES`，workflow 會自動使用。建議用專用帳號。
- 單檔上限 2 GB（Release 限制）；播放清單會打包成 ZIP。
- 請只下載你有權下載的內容，並遵守 YouTube 服務條款與當地法律。
