# 金龍永盛 AI 客服系統 - 後端服務

基於 Google Gemini 2.0 Flash 的智能客服 FAQ 自動回覆系統。

## 功能特點

- **FAQ 自動回覆**：基於知識庫的智能問答
- **意圖分類**：識別用戶意圖（16 種類型）
- **高性價比**：使用 Gemini 2.0 Flash，成本低至 $0.10/百萬 token

## 快速開始

### 1. 安裝依賴

```bash
cd backend
npm install
```

### 2. 設定環境變數

複製 `.env.example` 為 `.env` 並填入 API Key：

```bash
cp .env.example .env
```

編輯 `.env`：
```
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. 取得 Gemini API Key

1. 前往 [Google AI Studio](https://aistudio.google.com/)
2. 登入 Google 帳號
3. 點擊「Get API Key」建立新 Key
4. 複製 Key 貼到 `.env` 文件

### 4. 啟動服務

```bash
# 開發模式（自動重載）
npm run dev

# 正式模式
npm start
```

服務會在 http://localhost:3001 啟動。

### 5. 測試系統

```bash
npm test
```

## API 文檔

### 健康檢查
```
GET /health
```

### FAQ 自動回覆
```
POST /api/faq/reply
Content-Type: application/json

{
  "message": "改票要多少錢？"
}
```

回應：
```json
{
  "success": true,
  "reply": "改票費用依航空公司及票種規定而異...",
  "metadata": {
    "matchedFAQs": [...],
    "processingTime": 234,
    "tokenUsage": { "input": 500, "output": 100 }
  }
}
```

### 搜尋 FAQ
```
GET /api/faq/search?q=台胞證&limit=5
```

### 取得 FAQ 類別
```
GET /api/faq/categories
```

### 意圖分類
```
POST /api/intent/classify
Content-Type: application/json

{
  "message": "我想訂票"
}
```

## 專案結構

```
backend/
├── src/
│   ├── index.js        # 主入口，Express 服務
│   ├── config.js       # 配置文件
│   ├── gemini.js       # Gemini API 整合
│   ├── faqRetriever.js # FAQ 檢索模組
│   ├── prompts.js      # Prompt 設計
│   └── test.js         # 測試腳本
├── .env.example        # 環境變數範本
├── package.json
└── README.md
```

## 費用估算

基於 Gemini 2.0 Flash 定價：
- 輸入：$0.10 / 百萬 token
- 輸出：$0.40 / 百萬 token

| 日對話量 | 月 Token | 月費用（USD） | 月費用（TWD） |
|---------|---------|--------------|--------------|
| 50 條 | ~3.75M | ~$2 | ~$65 |
| 100 條 | ~7.5M | ~$4 | ~$130 |
| 200 條 | ~15M | ~$8 | ~$260 |

## 下一步開發

- [ ] 階段2：LINE Messaging API 串接
- [ ] 階段2：意圖分類 + 實體提取
- [ ] 階段3：多輪對話狀態管理
- [ ] 階段3：人工轉接流程

## 相關資源

- [Gemini API 文檔](https://ai.google.dev/gemini-api/docs)
- [Gemini API 定價](https://ai.google.dev/gemini-api/docs/pricing)
- [Google AI Studio](https://aistudio.google.com/)
