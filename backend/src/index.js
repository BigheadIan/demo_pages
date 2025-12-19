/**
 * 金龍永盛 AI 客服系統 - 主入口
 *
 * 提供 FAQ 自動回覆、意圖分類、客服管理後台 API 服務
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { initGemini, faqAutoReply, classifyIntent as geminiClassifyIntent, estimateCost } from './gemini.js';
import { loadFAQData, searchFAQ, getCategories, getFAQByCategory } from './faqRetriever.js';
import { initIntentClassifier, classifyIntent, INTENTS } from './intentClassifier.js';
import { extractAllEntities, flattenEntities } from './entityExtractor.js';
import { handleMessage, getSessionContext, clearSession } from './intentRouter.js';
import { verifySignature, verifySignatureMultiChannel, handleLineWebhook, handleLineWebhookWithPersistence } from './lineHandler.js';

// 管理後台路由
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import regionRoutes from './routes/regions.js';
import agentRoutes from './routes/agent.js';
import reportRoutes from './routes/reports.js';
import customerRoutes from './routes/customers.js';
import crmCustomerRoutes from './routes/crmCustomers.js';
import tagRoutes from './routes/tags.js';
import uploadRoutes from './routes/upload.js';
import quickReplyRoutes from './routes/quickReplies.js';
import aiRoutes from './routes/ai.js';

// 認證服務
import { initializeAdmin } from './services/authService.js';

// 定時任務服務
import { startScheduledTasks } from './services/scheduledTasks.js';

// AI 推薦服務
import { initAiSuggestionService } from './services/aiSuggestionService.js';

const app = express();

// 安全中間件
app.use(helmet({
  contentSecurityPolicy: false, // 允許前端載入
}));

// CORS 配置 - 支援多個來源
const allowedOrigins = [
  config.frontend.url,
  'http://localhost:5173',
  'http://localhost:3000',
  'https://golden-dragon-admin-xzhlnkkcdq-de.a.run.app',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // 允許無 origin 的請求（如 curl、Postman）
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS 拒絕來源: ${origin}`);
      callback(null, true); // 暫時允許所有來源以便除錯
    }
  },
  credentials: true,
}));

// 速率限制（API 端點）
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 每個 IP 最多 100 個請求
  message: { success: false, error: 'TooManyRequests', message: '請求過於頻繁，請稍後再試' },
});

// LINE Webhook 需要原始請求體來驗證簽名
app.use('/webhook/line', express.raw({ type: 'application/json' }));

// 其他路由使用 JSON 解析
app.use(express.json());

// 請求日誌
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ============ API 路由 ============

/**
 * 健康檢查
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: '金龍永盛 AI 客服系統',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * FAQ 自動回覆
 * POST /api/faq/reply
 */
app.post('/api/faq/reply', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message) {
    return res.status(400).json({
      success: false,
      error: '請提供 message 參數',
    });
  }

  try {
    const result = await faqAutoReply(message);
    res.json(result);
  } catch (error) {
    console.error('FAQ 回覆錯誤:', error);
    res.status(500).json({
      success: false,
      error: '系統錯誤，請稍後再試',
    });
  }
});

/**
 * 搜尋 FAQ
 * GET /api/faq/search?q=查詢關鍵字
 */
app.get('/api/faq/search', (req, res) => {
  const { q, limit = 5 } = req.query;

  if (!q) {
    return res.status(400).json({
      success: false,
      error: '請提供 q 查詢參數',
    });
  }

  const results = searchFAQ(q, parseInt(limit));
  res.json({
    success: true,
    query: q,
    count: results.length,
    results,
  });
});

/**
 * 取得 FAQ 類別
 * GET /api/faq/categories
 */
app.get('/api/faq/categories', (req, res) => {
  const categories = getCategories();
  res.json({
    success: true,
    categories,
  });
});

/**
 * 根據類別取得 FAQ
 * GET /api/faq/category/:category
 */
app.get('/api/faq/category/:category', (req, res) => {
  const { category } = req.params;
  const faqs = getFAQByCategory(category);
  res.json({
    success: true,
    category,
    count: faqs.length,
    faqs,
  });
});

/**
 * 意圖分類（進階版，使用專用分類器）
 * POST /api/intent/classify
 */
app.post('/api/intent/classify', async (req, res) => {
  const { message, conversationHistory } = req.body;

  if (!message) {
    return res.status(400).json({
      success: false,
      error: '請提供 message 參數',
    });
  }

  try {
    // 使用專用意圖分類器
    const intentResult = await classifyIntent(message, conversationHistory || []);

    // 同時進行實體提取
    const entities = extractAllEntities(message);
    const flatEntities = flattenEntities(entities);

    res.json({
      ...intentResult,
      extractedEntities: entities,
      flatEntities,
    });
  } catch (error) {
    console.error('意圖分類錯誤:', error);
    res.status(500).json({
      success: false,
      error: '系統錯誤，請稍後再試',
    });
  }
});

/**
 * 統一對話入口（整合意圖分類 + 處理路由）
 * POST /api/chat
 */
app.post('/api/chat', async (req, res) => {
  const { message, sessionId = 'default', userId } = req.body;

  if (!message) {
    return res.status(400).json({
      success: false,
      error: '請提供 message 參數',
    });
  }

  try {
    const result = await handleMessage(message, sessionId, userId);
    res.json(result);
  } catch (error) {
    console.error('對話處理錯誤:', error);
    res.status(500).json({
      success: false,
      error: '系統錯誤，請稍後再試',
    });
  }
});

/**
 * 取得對話上下文
 * GET /api/chat/context/:sessionId
 */
app.get('/api/chat/context/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const context = getSessionContext(sessionId);
  res.json({
    success: true,
    sessionId,
    context,
  });
});

/**
 * 清除對話
 * DELETE /api/chat/session/:sessionId
 */
app.delete('/api/chat/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  clearSession(sessionId);
  res.json({
    success: true,
    message: '對話已清除',
  });
});

/**
 * 取得所有意圖定義
 * GET /api/intent/definitions
 */
app.get('/api/intent/definitions', (req, res) => {
  res.json({
    success: true,
    intents: INTENTS,
  });
});

/**
 * 實體提取（測試用）
 * POST /api/entity/extract
 */
app.post('/api/entity/extract', (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({
      success: false,
      error: '請提供 message 參數',
    });
  }

  const entities = extractAllEntities(message);
  const flatEntities = flattenEntities(entities);

  res.json({
    success: true,
    message,
    entities,
    flatEntities,
  });
});

// ============ LINE Webhook ============

/**
 * LINE Messaging API Webhook
 * POST /webhook/line
 *
 * 接收 LINE 平台的訊息事件（支援多渠道）
 */
app.post('/webhook/line', async (req, res) => {
  // 取得原始請求體和簽名
  const body = req.body;
  const signature = req.headers['x-line-signature'];

  // 驗證簽名（多渠道模式）
  const bodyString = Buffer.isBuffer(body) ? body.toString() : JSON.stringify(body);
  const matchedRegion = await verifySignatureMultiChannel(bodyString, signature);

  if (!matchedRegion) {
    console.error('❌ LINE Webhook 簽名驗證失敗');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 解析事件
  let events;
  try {
    const parsed = Buffer.isBuffer(body) ? JSON.parse(body.toString()) : body;
    events = parsed.events || [];
  } catch (error) {
    console.error('❌ 解析 LINE Webhook 失敗:', error);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // LINE 要求在 1 秒內回應 200
  res.status(200).json({ success: true });

  // 非同步處理事件（傳入匹配的區域）
  if (events.length > 0) {
    console.log(`📨 收到 ${events.length} 個 LINE 事件 [區域: ${matchedRegion.name || '全域'}]`);

    // 對每個事件傳入區域資訊
    for (const event of events) {
      handleLineWebhookWithPersistence([event], matchedRegion).catch(error => {
        console.error('❌ 處理 LINE 事件錯誤:', error);
      });
    }
  }
});

/**
 * 費用估算
 * GET /api/stats/cost?input=1000&output=500
 */
app.get('/api/stats/cost', (req, res) => {
  const { input = 0, output = 0 } = req.query;
  const cost = estimateCost(parseInt(input), parseInt(output));
  res.json({
    success: true,
    ...cost,
  });
});

// ============ 管理後台 API 路由 ============

// 認證路由（登入、登出、刷新 Token）
app.use('/api/auth', authRoutes);

// 用戶管理路由（需認證）
app.use('/api/users', apiLimiter, userRoutes);

// 區域管理路由（需認證）
app.use('/api/regions', apiLimiter, regionRoutes);

// 客服工作台路由（需認證）
app.use('/api/agent', agentRoutes);

// 報表路由（需認證）
app.use('/api/reports', apiLimiter, reportRoutes);

// 顧客管理路由（需認證）
app.use('/api/customers', apiLimiter, customerRoutes);

// CRM 客戶管理路由（需認證）
app.use('/api/crm-customers', apiLimiter, crmCustomerRoutes);

// 標籤管理路由（需認證）
app.use('/api/tags', apiLimiter, tagRoutes);

// 罐頭訊息路由（需認證）
app.use('/api/quick-replies', apiLimiter, quickReplyRoutes);

// AI 服務路由（需認證）
app.use('/api/ai', apiLimiter, aiRoutes);

// 文件上傳
app.use('/api/upload', uploadRoutes);

// 靜態文件服務（上傳的文件）
app.use('/uploads', express.static('uploads'));

// ============ 啟動服務 ============

async function startServer() {
  console.log('🚀 正在啟動金龍永盛 AI 客服系統...');

  // 1. 載入 FAQ 資料
  await loadFAQData();

  // 2. 初始化 Gemini API（FAQ 回覆用）
  const geminiReady = initGemini();

  // 3. 初始化意圖分類器
  const intentReady = initIntentClassifier();

  if (!geminiReady || !intentReady) {
    console.warn('⚠️ Gemini API 未完全初始化，部分功能將無法使用');
    console.warn('   請設定 GEMINI_API_KEY 環境變數');
  }

  // 4. 初始化 AI 推薦服務
  const aiSuggestionReady = initAiSuggestionService();

  // 5. 檢查 LINE 配置
  const lineReady = config.line?.channelAccessToken && config.line?.channelSecret;

  // 6. 初始化管理員帳號（如果資料庫已連接）
  try {
    await initializeAdmin();
  } catch (error) {
    console.warn('⚠️ 無法初始化管理員帳號（資料庫可能未連接）');
    console.warn('   執行 `npx prisma migrate dev` 來設定資料庫');
  }

  // 7. 啟動定時任務
  startScheduledTasks();

  // 8. 啟動 HTTP 服務
  app.listen(config.server.port, () => {
    console.log(`\n✅ 服務已啟動！`);
    console.log(`📍 http://localhost:${config.server.port}`);
    console.log(`\n============ AI 客服 API ============`);
    console.log(`  GET  /health               - 健康檢查`);
    console.log(`  POST /api/chat             - 統一對話入口`);
    console.log(`  POST /api/faq/reply        - FAQ 自動回覆`);
    console.log(`  POST /api/intent/classify  - 意圖分類`);
    console.log(`  POST /webhook/line         - LINE Webhook`);
    console.log(`\n============ 管理後台 API ============`);
    console.log(`  POST /api/auth/login       - 登入`);
    console.log(`  GET  /api/auth/me          - 當前用戶`);
    console.log(`  GET  /api/users            - 用戶列表`);
    console.log(`  GET  /api/regions          - 區域列表`);
    console.log(`  GET  /api/agent/queue      - 等待佇列`);
    console.log(`  GET  /api/reports/overview - 報表總覽`);
    console.log(`  GET  /api/customers        - 顧客列表`);
    console.log(`  GET  /api/crm-customers    - CRM 客戶列表`);
    console.log(`  GET  /api/tags             - 標籤列表`);
    console.log(`\n============ 系統狀態 ============`);
    console.log(`🔑 Gemini API: ${geminiReady ? '✅ 已啟用' : '❌ 未啟用'}`);
    console.log(`🧠 意圖分類器: ${intentReady ? '✅ 已啟用' : '❌ 未啟用'}`);
    console.log(`💡 AI 推薦服務: ${aiSuggestionReady ? '✅ 已啟用' : '⚠️ 未啟用'}`);
    console.log(`📱 LINE Bot: ${lineReady ? '✅ 已設定' : '⚠️ 未設定'}`);
    console.log(`⏰ 定時任務: ✅ 已啟動`);
    console.log(`\n👤 管理員帳號: ${config.admin.email}`);
    console.log(`   （首次登入請使用 .env 中設定的密碼）`);
  });
}

startServer().catch(console.error);
