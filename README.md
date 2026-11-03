# dlp-cloud

純前端網頁 + Cloudflare Worker + GitHub Actions Windows Runner，支援 YouTube、bilibili 與 Instagram 的影片、播放清單及純音訊下載。

```
瀏覽器（Cloudflare Managed Challenge）→ GitHub Pages → Turnstile（下載前）→ Worker → GitHub Actions workflow_dispatch
                                      → Windows runner：yt-dlp、ffmpeg → GitHub Release 暫存檔
```

## 部署

1. 將 repo 設定為 GitHub Pages，Source 選 **GitHub Actions**。
2. 在 Cloudflare 建立 Turnstile widget，Hostname 填網站網域，將 Site key 填入 `web/config.js`。
3. 在 Worker 設定 secrets：

   ```
   npx wrangler secret put GH_TOKEN
   npx wrangler secret put TURNSTILE_SECRET
   ```

4. 將 `worker/wrangler.toml` 的 `ALLOWED_ORIGIN` 改為實際網站網址，然後部署：

   ```
   cd worker
   npm install
   npx wrangler deploy
   ```

GitHub Actions 自動部署 Worker 需要 repository secrets `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`。若來源網站需要登入，可分別設定 `YT_COOKIES`、`BILI_COOKIES`、`IG_COOKIES`（Netscape 格式）供 workflow 使用。

進入網站的驗證由 Cloudflare WAF Managed Challenge 處理；下載按鈕前使用 Turnstile，完成後才能建立下載任務。請把 `worker/wrangler.toml` 的 `ALLOWED_ORIGIN` 設為實際網站網址。

下載檔案會發佈為暫存 GitHub Release，清理 workflow 每 6 小時刪除 `job-*` releases。單檔上限為 2 GB；請只下載你有權下載的內容。

## License

Copyleft by MIT License｜以 MIT 授權條款釋出。
