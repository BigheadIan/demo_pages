# 使用 Node.js 22 Alpine 映像（輕量）
FROM node:22-alpine

# 設定工作目錄
WORKDIR /app

# 複製 package 檔案
COPY package*.json ./

# 安裝依賴
RUN npm ci --only=production

# 複製應用程式碼
COPY . .

# 設定環境變數
ENV NODE_ENV=production
ENV PORT=8080

# 暴露端口（Cloud Run 預設使用 8080）
EXPOSE 8080

# 啟動應用
CMD ["node", "src/index.js"]
