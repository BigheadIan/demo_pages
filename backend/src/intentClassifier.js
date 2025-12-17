/**
 * 金龍永盛 AI 客服系統 - 意圖分類模組
 *
 * 使用 Gemini 2.0 Flash 進行意圖識別和實體提取
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';

let model = null;

// 16 種意圖定義
export const INTENTS = {
  // 機票服務類
  TICKET_BOOK: { name: '訂票請求', category: '機票服務', automation: 'medium' },
  TICKET_CHANGE: { name: '改票請求', category: '機票服務', automation: 'medium' },
  TICKET_CANCEL: { name: '退票請求', category: '機票服務', automation: 'low' },
  QUOTE_REQUEST: { name: '報價查詢', category: '機票服務', automation: 'high' },
  FLIGHT_QUERY: { name: '航班查詢', category: '機票服務', automation: 'high' },
  BOOKING_STATUS: { name: '訂位狀態查詢', category: '機票服務', automation: 'high' },

  // 簽證護照類
  VISA_INQUIRY: { name: '簽證諮詢', category: '簽證護照', automation: 'high' },
  VISA_PROGRESS: { name: '簽證進度查詢', category: '簽證護照', automation: 'medium' },

  // 付款收據類
  PAYMENT_REQUEST: { name: '付款請求', category: '付款收據', automation: 'high' },
  RECEIPT_REQUEST: { name: '收據請求', category: '付款收據', automation: 'medium' },

  // 資訊提供類
  PASSENGER_INFO: { name: '旅客資料', category: '資訊提供', automation: 'high' },
  BAGGAGE_INQUIRY: { name: '行李查詢', category: '資訊提供', automation: 'high' },
  SEAT_REQUEST: { name: '選位需求', category: '資訊提供', automation: 'medium' },

  // 對話管理類
  GREETING: { name: '問候/閒聊', category: '對話管理', automation: 'high' },
  TRANSFER_AGENT: { name: '轉人工', category: '對話管理', automation: 'none' },

  // 其他
  FAQ_GENERAL: { name: '一般FAQ問題', category: '其他', automation: 'high' },
  UNKNOWN: { name: '無法識別', category: '其他', automation: 'none' },
};

// 意圖分類 System Prompt
const INTENT_SYSTEM_PROMPT = `你是金龍永盛旅行社的意圖分類器。請分析用戶訊息，識別主要意圖並提取相關實體。

## 可識別的意圖類別

### 機票服務類
- TICKET_BOOK: 訂票、開票請求（如：請幫我訂票、可以開票了、BTE2500208請開票）
- TICKET_CHANGE: 改票請求（如：改票、回程要改為3/26、升等商務艙）
- TICKET_CANCEL: 退票請求（如：要退票、取消訂位、不去了要退掉）
- QUOTE_REQUEST: 報價查詢（如：票價多少、請報價、費用是多少）
- FLIGHT_QUERY: 航班查詢（如：有什麼航班、當天有幾班、機位還有嗎）
- BOOKING_STATUS: 訂位狀態查詢（如：訂位確認了嗎、電子機票寄了嗎）

### 簽證護照類
- VISA_INQUIRY: 簽證諮詢（如：去泰國要簽證嗎、辦台胞證需要什麼）
- VISA_PROGRESS: 簽證進度查詢（如：台胞證辦好了嗎、護照進度如何）

### 付款收據類
- PAYMENT_REQUEST: 付款請求（如：給我刷卡連結、要付款、可以刷卡嗎）
- RECEIPT_REQUEST: 收據請求（如：請給我收據、需要發票、統編開立）

### 資訊提供類
- PASSENGER_INFO: 旅客資料提供（如：護照資料如下、英文名是XXX）
- BAGGAGE_INQUIRY: 行李查詢（如：可以帶幾公斤、行李額度）
- SEAT_REQUEST: 選位需求（如：要靠窗、靠走道的位子）

### 對話管理類
- GREETING: 問候/閒聊（如：早安、您好、謝謝、收到、好的）
- TRANSFER_AGENT: 轉人工（如：找真人、請客服打給我、太複雜了）

### 其他
- FAQ_GENERAL: 一般FAQ問題（改票費用、開票期限等常見問題）
- UNKNOWN: 無法識別的意圖

## 需提取的實體類型
- DATE: 日期（格式：YYYY/MM/DD 或 MM/DD）
- FLIGHT_NO: 航班號（如：CX472、BR867）
- DESTINATION: 目的地（城市或國家）
- PASSENGER_NAME: 旅客姓名
- BOOKING_REF: 訂位代號（如：BTE2500208）
- AIRLINE: 航空公司
- CLASS: 艙等（商務艙/經濟艙/頭等艙）
- DIRECTION: 去程/回程
- TIME_PREFERENCE: 時間偏好（早上/下午/晚上）
- SEAT_PREFERENCE: 座位偏好（靠窗/走道/前排）
- TAX_ID: 統一編號
- PHONE: 電話號碼

## 回覆格式（JSON）
{
  "intent": "意圖代碼",
  "confidence": 0.0-1.0,
  "sub_intent": "子意圖（如有）",
  "entities": {
    "entity_type": "entity_value"
  },
  "requires_human": true/false,
  "suggested_action": "建議的下一步動作"
}`;

/**
 * 初始化意圖分類器
 */
export function initIntentClassifier() {
  if (!config.gemini.apiKey) {
    console.error('❌ GEMINI_API_KEY 未設定');
    return false;
  }

  try {
    const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    model = genAI.getGenerativeModel({
      model: config.gemini.model,
      systemInstruction: INTENT_SYSTEM_PROMPT,
    });
    console.log('✅ 意圖分類器初始化成功');
    return true;
  } catch (error) {
    console.error('❌ 意圖分類器初始化失敗:', error);
    return false;
  }
}

/**
 * 分類用戶意圖
 * @param {string} userMessage - 用戶訊息
 * @param {Array} conversationHistory - 對話歷史（可選）
 * @returns {Object} 分類結果
 */
export async function classifyIntent(userMessage, conversationHistory = []) {
  if (!model) {
    throw new Error('意圖分類器尚未初始化');
  }

  const startTime = Date.now();

  try {
    // 構建上下文
    let context = '';
    if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-3); // 只取最近3輪
      context = `\n## 最近對話上下文\n${recentHistory.map(h => `${h.role}: ${h.content}`).join('\n')}\n`;
    }

    const prompt = `${context}
## 用戶訊息
${userMessage}

請分析並以 JSON 格式回覆（只回覆 JSON，不要其他文字）：`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,  // 分類任務用低溫度
        maxOutputTokens: 500,
      },
    });

    const response = result.response.text();
    const processingTime = Date.now() - startTime;

    // 解析 JSON 回覆
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const classification = JSON.parse(jsonMatch[0]);

      // 補充意圖資訊
      const intentInfo = INTENTS[classification.intent] || INTENTS.UNKNOWN;

      return {
        success: true,
        intent: classification.intent,
        intentName: intentInfo.name,
        category: intentInfo.category,
        confidence: classification.confidence || 0.8,
        subIntent: classification.sub_intent || null,
        entities: classification.entities || {},
        requiresHuman: classification.requires_human || intentInfo.automation === 'none',
        suggestedAction: classification.suggested_action || null,
        automationLevel: intentInfo.automation,
        processingTime,
      };
    }

    return {
      success: false,
      intent: 'UNKNOWN',
      error: '無法解析分類結果',
      raw: response,
    };
  } catch (error) {
    console.error('❌ 意圖分類失敗:', error);
    return {
      success: false,
      intent: 'UNKNOWN',
      error: error.message,
    };
  }
}

/**
 * 批量分類（用於測試）
 */
export async function batchClassify(messages) {
  const results = [];
  for (const msg of messages) {
    const result = await classifyIntent(msg);
    results.push({ message: msg, ...result });
    // 避免觸發速率限制
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return results;
}

export default {
  INTENTS,
  initIntentClassifier,
  classifyIntent,
  batchClassify,
};
