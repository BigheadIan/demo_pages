/**
 * 金龍永盛 AI 客服系統 - 配置文件
 */
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Gemini API 配置
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.0-flash',  // Gemini 2.0 Flash（免費版可用）
  },

  // LINE Messaging API 配置（預設區域）
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    channelId: process.env.LINE_CHANNEL_ID || 'default',
  },

  // 服務配置
  server: {
    port: process.env.PORT || 3001,
    env: process.env.NODE_ENV || 'development',
  },

  // JWT 認證配置
  jwt: {
    secret: process.env.JWT_SECRET || 'default-jwt-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Redis 配置（可選）
  redis: {
    url: process.env.REDIS_URL || null,
  },

  // 管理員初始帳號
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@golden-dragon.com',
    password: process.env.ADMIN_PASSWORD || 'admin123456',
  },

  // 前端 URL（CORS）
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
  },

  // FAQ 配置
  faq: {
    similarityThreshold: 0.7,  // 相似度閾值
    maxResults: 3,             // 最多返回幾個相關 FAQ
  },

  // 回覆配置
  response: {
    maxLength: 500,           // 最大回覆長度
    temperature: 0.3,         // 生成溫度（較低=更確定性）
  },
};

export default config;
