# dlp-cloud

純前端網頁 + Cloudflare Worker + GitHub Actions Windows Runner，支援 YouTube、bilibili 與 Instagram 的影片、播放清單及純音訊下載。

```
瀏覽器（Cloudflare Managed Challenge）→ GitHub Pages → reCAPTCHA v3（低於 0.7 時改用 v2）→ Worker → GitHub Actions workflow_dispatch
                                      → Windows runner：yt-dlp、ffmpeg → GitHub Release 暫存檔
```

## 部署

1. 將 repo 設定為 GitHub Pages，Source 選 **GitHub Actions**。
2. 在 Google reCAPTCHA 建立 v3 Site key 與 v2「我不是機器人」Site key，將兩個 Site key 填入 `web/config.js`。
3. 在 Worker 設定 secrets：

   ```
   npx wrangler secret put GH_TOKEN
   npx wrangler secret put RECAPTCHA_V3_SECRET
   npx wrangler secret put RECAPTCHA_V2_SECRET
   ```

4. 將 `worker/wrangler.toml` 的 `ALLOWED_ORIGIN` 改為實際網站網址，然後部署：

   ```
   cd worker
   npm install
   npx wrangler deploy
   ```

GitHub Actions 自動部署 Worker 需要 repository secrets `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`。若來源網站需要登入，可分別設定 `YT_COOKIES`、`BILI_COOKIES`、`IG_COOKIES`（Netscape 格式）供 workflow 使用。

進入網站的驗證由 Cloudflare WAF Managed Challenge 處理；下載按鈕才會執行 reCAPTCHA v3。v3 分數低於 0.7 時，頁面會顯示 v2 核取方塊，完成後才能建立下載任務。請將 reCAPTCHA 網域設定為實際網站網域，並把 `worker/wrangler.toml` 的 `ALLOWED_ORIGIN` 設為相同網址。

下載檔案會發佈為暫存 GitHub Release，清理 workflow 每 6 小時刪除 `job-*` releases。單檔上限為 2 GB；請只下載你有權下載的內容。

## License

Copyleft by MIT License｜以 MIT 授權條款釋出。
