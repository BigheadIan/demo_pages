# 使用 Node.js 22 Alpine 映像
FROM node:22-alpine

# 設定工作目錄
WORKDIR /app

# 複製 package 檔案
COPY package*.json ./
COPY prisma ./prisma/

# 安裝所有依賴（包含 devDependencies 以便生成 Prisma client）
RUN npm ci

# 生成 Prisma Client
RUN npx prisma generate

# 複製應用程式碼
COPY . .

# 設定環境變數
ENV NODE_ENV=production
ENV PORT=8080

# 暴露端口（Cloud Run 預設使用 8080）
EXPOSE 8080

# 啟動應用
CMD ["node", "src/index.js"]
