# 如何讓外部訪問網頁

以下是幾種最簡單的方法，讓您的客服工作台 DEMO 可以在外部網路被訪問：

## 方法 1：使用 Python 內建伺服器（推薦）

如果您已經安裝了 Python（macOS 通常已內建），這是最簡單的方法。

### 步驟：
1. 打開終端機（Terminal）
2. 進入專案資料夾：
   ```bash
   cd "/Users/BigheadIan/Desktop/travel agency"
   ```
3. 啟動伺服器：
   ```bash
   # Python 3
   python3 -m http.server 8000
   
   # 或 Python 2
   python -m SimpleHTTPServer 8000
   ```
4. 伺服器啟動後，您會看到類似訊息：
   ```
   Serving HTTP on 0.0.0.0 port 8000 ...
   ```

### 訪問方式：
- **本地訪問**：http://localhost:8000
- **同一區域網路訪問**：
  - 在終端機找到您的 IP 位址：`ipconfig getifaddr en0`（或在系統偏好設定 > 網路查看）
  - 假設您的 IP 是 `192.168.1.100`，則訪問：http://192.168.1.100:8000
  - 同一 Wifi 網路下的手機、平板、其他電腦都可以通過這個網址訪問

---

## 方法 2：使用 Node.js（如果您已安裝 Node.js）

```bash
# 安裝 http-server（只需安裝一次）
npm install -g http-server

# 進入專案資料夾並啟動
cd "/Users/BigheadIan/Desktop/travel agency"
http-server -p 8000 --host 0.0.0.0
```

---

## 方法 3：使用 nginx（進階，適合長期使用）

1. 安裝 nginx：
   ```bash
   brew install nginx
   ```

2. 啟動 nginx：
   ```bash
   nginx
   ```

3. 將專案檔案複製到 nginx 目錄（通常為 `/usr/local/var/www`）

4. 訪問：http://localhost

---

## 方法 4：部署到免費靜態網站託管服務

### 選項 A：GitHub Pages
1. 將專案推送到 GitHub
2. 在倉庫設定中啟用 GitHub Pages
3. 選擇主分支（main）作為源
4. 幾分鐘後即可通過 `https://您的使用者名稱.github.io/專案名稱` 訪問

### 選項 B：Netlify
1. 訪問 https://www.netlify.com
2. 註冊帳號（免費）
3. 將專案資料夾拖曳到 Netlify 網站
4. 立即獲得一個公開的 URL

### 選項 C：Vercel
1. 訪問 https://vercel.com
2. 註冊並連接 GitHub
3. 導入專案
4. 一鍵部署

---

## 推薦使用方法

### 快速本地演示
使用 **方法 1（Python 內建伺服器）**，最簡單且無需安裝額外軟體。

### 長期公開訪問
使用 **方法 4（靜態網站託管）**，可以獲得一個穩定的公開網址。

---

## 安全提醒

⚠️ 使用本地 HTTP 伺服器讓其他電腦訪問時：
- 僅在同一信任的網路環境中使用（如同事、家人）
- 不要將伺服器暴露到公共網路
- 演示結束後記得關閉伺服器（在終端按 `Ctrl + C`）

---

## 常見問題

### Q: 其他設備無法訪問？
A: 
1. 確認設備連接到同一 Wi-Fi 網路
2. 確認防火牆沒有阻擋 8000 端口
3. 在 macOS 系統偏好設定中允許終端訪問網路

### Q: 如何停止伺服器？
A: 在終端按 `Ctrl + C`

### Q: 如何修改端口號？
A: 將 `8000` 改為其他數字，例如：
```bash
python3 -m http.server 8080
```

