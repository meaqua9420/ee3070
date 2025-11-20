# Smart Cat Search Proxy

這個小型 Express 服務會把前端/後端的 `searchWeb` 請求轉發到 **Google Custom Search JSON API**，並轉成後端預期的結構。  
啟動後端前請先啟動此服務，或部署到其他可存取的位置並更新 `SMARTCAT_SEARCH_PROXY_URL`。

## 安裝

```bash
cd search-proxy
npm install
```

## 環境變數

在啟動前需要設定：

| 變數 | 說明 |
| --- | --- |
| `GOOGLE_SEARCH_API_KEY` | 你的 Google Custom Search API Key（例如 `AIza...`） |
| `GOOGLE_SEARCH_CX` | 對應的 Custom Search Engine ID（cx） |
| `PORT` *(選填)* | 代理服務的埠號，預設 `5858` |

範例 `.env`（可自行建立）：

```env
GOOGLE_SEARCH_API_KEY=AIzaSy...
GOOGLE_SEARCH_CX=1234567890abcdef
PORT=5858
```

## 啟動

```bash
node server.mjs
# 或使用 watcher
npm run dev
```

啟動後會在 `http://127.0.0.1:5858/search` 提供查詢端點。

## 與後端整合

在 `smart-cat-backend/.env` 中設定：

```
SMARTCAT_SEARCH_PROXY_URL=http://127.0.0.1:5858/search
```

並重新啟動後端。之後 `searchWeb` 工具就會透過代理存取 Google Custom Search。

## 查詢格式

- `GET /search?q=<關鍵字>&lang=<選填語言>&limit=<選填數量>`
- 回應格式：

```json
{
  "ok": true,
  "query": "can you help me search how to take care of the cat?",
  "results": [
    { "title": "...", "url": "...", "snippet": "..." }
  ],
  "totalResults": 12345,
  "searchTimeMs": 210
}
```

若 Google API 傳回錯誤，會對應到 HTTP 4xx/5xx，並附上 `message` 與 `detail`。
