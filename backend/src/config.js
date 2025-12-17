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
    // 備選模型
    // model: 'gemini-2.0-flash-exp',  // 實驗版
  },

  // LINE Messaging API 配置
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  },

  // 服務配置
  server: {
    port: process.env.PORT || 3001,
    env: process.env.NODE_ENV || 'development',
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
