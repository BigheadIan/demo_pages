/**
 * 金龍永盛 AI 客服系統 - 意圖處理路由器
 *
 * 根據識別的意圖，路由到對應的處理函數
 */
import { classifyIntent, INTENTS } from './intentClassifier.js';
import { extractAllEntities, flattenEntities } from './entityExtractor.js';
import { faqAutoReply } from './gemini.js';
import { searchFAQ, formatFAQContext } from './faqRetriever.js';

// ============ Session 管理 ============

// 簡易記憶體儲存（生產環境應使用 Redis 或 Firestore）
const sessions = new Map();

/**
 * 取得或創建 session
 */
function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      history: [],
      entities: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return sessions.get(sessionId);
}

/**
 * 取得 session 上下文
 * @param {string} sessionId - Session ID
 */
export function getSessionContext(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }
  return {
    ...session,
    historyCount: session.history.length,
  };
}

/**
 * 清除 session
 * @param {string} sessionId - Session ID
 */
export function clearSession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * 更新 session 歷史
 */
function updateSessionHistory(sessionId, userMessage, response) {
  const session = getOrCreateSession(sessionId);
  session.history.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  });
  session.history.push({
    role: 'assistant',
    content: response,
    timestamp: new Date().toISOString(),
  });
  // 只保留最近 10 輪對話
  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }
  session.updatedAt = new Date().toISOString();
}

// ============ 訊息處理 ============

/**
 * 處理用戶訊息的主入口
 * @param {string} userMessage - 用戶訊息
 * @param {string} sessionId - Session ID（用於追蹤對話）
 * @param {string} userId - 用戶 ID（可選）
 * @returns {Object} 處理結果
 */
export async function handleMessage(userMessage, sessionId = 'default', userId = null) {
  const startTime = Date.now();

  // 取得或創建 session
  const session = getOrCreateSession(sessionId);
  if (userId) {
    session.userId = userId;
  }

  try {
    // 1. 意圖分類（傳入對話歷史以提供上下文）
    const intentResult = await classifyIntent(userMessage, session.history || []);

    // 2. 規則式實體提取（補充 LLM 提取的實體）
    const ruleBasedEntities = extractAllEntities(userMessage);
    const flatEntities = flattenEntities(ruleBasedEntities);

    // 合併實體（LLM 提取 + 規則提取）
    const mergedEntities = {
      ...session.entities,  // 保留 session 中已收集的實體
      ...flatEntities,
      ...intentResult.entities,
    };

    // 更新 session 實體
    session.entities = mergedEntities;

    // 3. 根據意圖路由到處理器
    const handler = getIntentHandler(intentResult.intent);
    const response = await handler(userMessage, mergedEntities, session);

    const processingTime = Date.now() - startTime;

    // 4. 更新對話歷史
    updateSessionHistory(sessionId, userMessage, response.message);

    return {
      success: true,
      sessionId,
      intent: intentResult.intent,
      intentName: intentResult.intentName,
      category: intentResult.category,
      confidence: intentResult.confidence,
      entities: mergedEntities,
      reply: response.message,
      requiresHuman: response.requiresHuman || intentResult.requiresHuman,
      suggestedActions: response.suggestedActions || [],
      processingTime,
    };
  } catch (error) {
    console.error('❌ 訊息處理失敗:', error);
    return {
      success: false,
      sessionId,
      error: error.message,
      reply: '抱歉，系統暫時無法處理您的請求，請稍後再試或聯繫人工客服。',
      requiresHuman: true,
    };
  }
}

/**
 * 獲取意圖對應的處理器
 */
function getIntentHandler(intent) {
  const handlers = {
    // 機票服務類
    TICKET_BOOK: handleTicketBook,
    TICKET_CHANGE: handleTicketChange,
    TICKET_CANCEL: handleTicketCancel,
    QUOTE_REQUEST: handleQuoteRequest,
    FLIGHT_QUERY: handleFlightQuery,
    BOOKING_STATUS: handleBookingStatus,

    // 簽證護照類
    VISA_INQUIRY: handleVisaInquiry,
    VISA_PROGRESS: handleVisaProgress,

    // 付款收據類
    PAYMENT_REQUEST: handlePaymentRequest,
    RECEIPT_REQUEST: handleReceiptRequest,

    // 資訊提供類
    PASSENGER_INFO: handlePassengerInfo,
    BAGGAGE_INQUIRY: handleBaggageInquiry,
    SEAT_REQUEST: handleSeatRequest,

    // 對話管理類
    GREETING: handleGreeting,
    TRANSFER_AGENT: handleTransferAgent,

    // 其他
    FAQ_GENERAL: handleFaqGeneral,
    UNKNOWN: handleUnknown,
  };

  return handlers[intent] || handleUnknown;
}

// ============ 意圖處理器 ============

/**
 * 訂票請求處理
 */
async function handleTicketBook(message, entities, context) {
  let response = '';
  const suggestedActions = [];

  if (entities.booking_ref) {
    response = `好的，我已收到您的開票請求。
訂位代號：${entities.booking_ref}
${entities.destination ? `目的地：${entities.destination}` : ''}

請稍候，我會確認訂位資訊後為您處理開票。確認後會再通知您付款方式。`;
    suggestedActions.push('確認訂位資訊', '發送付款連結');
  } else {
    response = `好的，我來協助您訂票。請提供以下資訊：
1. 出發日期
2. 目的地
3. 旅客人數
4. 艙等偏好（經濟/商務）

或者，如果您已有訂位代號，請直接提供給我。`;
  }

  return {
    message: response,
    requiresHuman: true,
    suggestedActions,
  };
}

/**
 * 改票請求處理
 */
async function handleTicketChange(message, entities, context) {
  let response = '好的，我來協助您改票。\n\n';

  if (entities.date) {
    response += `新日期：${entities.date}\n`;
  }
  if (entities.flight_no) {
    response += `新航班：${entities.flight_no}\n`;
  }
  if (entities.direction) {
    response += `航段：${entities.direction === 'OUTBOUND' ? '去程' : '回程'}\n`;
  }
  if (entities.class) {
    response += `艙等：${entities.class === 'BUSINESS' ? '商務艙' : entities.class === 'ECONOMY' ? '經濟艙' : entities.class}\n`;
  }

  response += `\n改票可能會產生費用（約 TWD 800-3,300），實際費用需視票種規定而定。

請問您要修改的是哪位旅客的機票？請提供旅客姓名或訂位代號。`;

  return {
    message: response,
    requiresHuman: true,
    suggestedActions: ['查詢改票費用', '確認改票'],
  };
}

/**
 * 退票請求處理
 */
async function handleTicketCancel(message, entities, context) {
  return {
    message: `我了解您想要退票。退票需要注意以下事項：

1. 部分促銷票/特惠票可能不可退票
2. 一般經濟艙退票手續費約 TWD 2,000-5,000
3. 已使用的機票無法退票

請提供您的訂位代號或旅客姓名，我會查詢您的票種規定並說明退票費用。

由於退票涉及費用計算，我會轉請專人為您處理。`,
    requiresHuman: true,
    suggestedActions: ['轉人工處理'],
  };
}

/**
 * 報價查詢處理
 */
async function handleQuoteRequest(message, entities, context) {
  let response = '好的，我來為您查詢票價。\n\n';

  if (entities.destination) {
    response += `目的地：${entities.destination}\n`;
  }
  if (entities.date) {
    response += `日期：${entities.date}\n`;
  }
  if (entities.class) {
    response += `艙等：${entities.class === 'BUSINESS' ? '商務艙' : '經濟艙'}\n`;
  }

  if (!entities.destination || !entities.date) {
    response += `\n為了給您準確的報價，請提供：
1. 目的地城市
2. 出發日期
3. 回程日期（如需要）
4. 旅客人數`;
  } else {
    response += `\n請稍候，我正在查詢票價...

（目前系統尚未串接 GDS，票價查詢功能開發中。請聯繫客服取得報價。）`;
  }

  return {
    message: response,
    requiresHuman: !entities.destination || !entities.date,
    suggestedActions: ['提供詳細報價'],
  };
}

/**
 * 航班查詢處理
 */
async function handleFlightQuery(message, entities, context) {
  let response = '好的，我來為您查詢航班。\n\n';

  if (entities.destination) {
    response += `目的地：${entities.destination}\n`;
  }
  if (entities.date) {
    response += `日期：${entities.date}\n`;
  }
  if (entities.airline) {
    response += `航空公司：${entities.airline}\n`;
  }

  response += `\n（目前系統尚未串接 GDS，航班查詢功能開發中。）

如需立即查詢，請告知：
1. 出發城市和目的地
2. 出發日期
3. 偏好的航空公司（如有）

我會請專人為您查詢可用航班。`;

  return {
    message: response,
    requiresHuman: true,
    suggestedActions: ['查詢航班'],
  };
}

/**
 * 訂位狀態查詢處理
 */
async function handleBookingStatus(message, entities, context) {
  if (entities.booking_ref) {
    return {
      message: `好的，我來查詢訂位代號 ${entities.booking_ref} 的狀態。

（目前系統尚未串接內部訂位系統，請稍候由專人為您確認。）`,
      requiresHuman: true,
      suggestedActions: ['查詢訂位狀態'],
    };
  }

  return {
    message: `請提供您的訂位代號或旅客姓名，我來為您查詢訂位狀態。

訂位代號格式範例：BTE2500208`,
    requiresHuman: false,
    suggestedActions: [],
  };
}

/**
 * 簽證諮詢處理 - 使用 FAQ
 */
async function handleVisaInquiry(message, entities, context) {
  // 使用 FAQ 自動回覆
  const faqResult = await faqAutoReply(message);

  if (faqResult.success) {
    return {
      message: faqResult.reply,
      requiresHuman: false,
      suggestedActions: [],
    };
  }

  return {
    message: `關於簽證問題，以下是一些常見資訊：

${entities.destination ? `您詢問的是前往${entities.destination}的簽證。` : ''}

如需詳細的簽證資訊，請告知您的目的地國家，我會為您查詢。

常見諮詢：台胞證、泰國簽證、申根免簽等。`,
    requiresHuman: false,
    suggestedActions: [],
  };
}

/**
 * 簽證進度查詢處理
 */
async function handleVisaProgress(message, entities, context) {
  return {
    message: `好的，我來查詢您的簽證/護照辦理進度。

請問是哪位申請人的證件？以及是辦理什麼證件（台胞證/護照/其他簽證）？

一般辦理時間參考：
- 台胞證一般件：5-7個工作天
- 台胞證急件：3個工作天
- 護照換發：約4個工作天`,
    requiresHuman: true,
    suggestedActions: ['查詢辦理進度'],
  };
}

/**
 * 付款請求處理
 */
async function handlePaymentRequest(message, entities, context) {
  return {
    message: `好的，我來協助您付款。

我們提供以下付款方式：
- 線上刷卡（Visa/MasterCard/JCB）
- 銀行匯款

${entities.booking_ref ? `訂位代號：${entities.booking_ref}` : '請提供您的訂位代號，我會發送刷卡連結給您。'}

注意：刷卡連結有時效限制，請儘速完成付款。`,
    requiresHuman: true,
    suggestedActions: ['發送刷卡連結'],
  };
}

/**
 * 收據請求處理
 */
async function handleReceiptRequest(message, entities, context) {
  let response = `好的，我來協助您申請收據/發票。\n\n`;

  if (entities.tax_id) {
    response += `統一編號：${entities.tax_id}\n`;
  }

  response += `請問需要開立：
1. 二聯式發票（個人）
2. 三聯式發票（公司報帳）

${!entities.tax_id ? '如需開立公司抬頭，請提供統一編號。' : ''}

收據會在付款完成後1-2個工作天由會計部門開立。`;

  return {
    message: response,
    requiresHuman: true,
    suggestedActions: ['轉會計處理'],
  };
}

/**
 * 旅客資料處理
 */
async function handlePassengerInfo(message, entities, context) {
  return {
    message: `好的，我已收到您提供的旅客資料。

為確保資料正確，請確認以下訂票所需資訊是否完整：
1. 護照英文姓名（需與護照完全一致）
2. 出生日期
3. 護照號碼
4. 護照有效期限
5. 國籍

如有其他旅客，請一併提供資料。`,
    requiresHuman: false,
    suggestedActions: ['確認資料'],
  };
}

/**
 * 行李查詢處理 - 使用 FAQ
 */
async function handleBaggageInquiry(message, entities, context) {
  const faqResult = await faqAutoReply(message);

  if (faqResult.success) {
    return {
      message: faqResult.reply,
      requiresHuman: false,
      suggestedActions: [],
    };
  }

  return {
    message: `關於行李規定，各航空公司略有不同。

一般來說：
- 經濟艙：20-30公斤
- 商務艙：30-40公斤

${entities.airline ? `您詢問的是${entities.airline}的規定。` : '請問您是搭乘哪家航空公司？'}

我會為您查詢詳細的行李規定。`,
    requiresHuman: false,
    suggestedActions: [],
  };
}

/**
 * 選位需求處理
 */
async function handleSeatRequest(message, entities, context) {
  let response = '好的，我已記錄您的座位偏好。\n\n';

  if (entities.seat_preference) {
    const prefMap = { WINDOW: '靠窗', AISLE: '走道', FRONT: '前排' };
    response += `座位偏好：${prefMap[entities.seat_preference] || entities.seat_preference}\n`;
  }

  response += `\n我們會在訂位時盡量為您安排偏好的座位。

提醒：實際座位安排需視航空公司規定和可用座位而定。`;

  return {
    message: response,
    requiresHuman: false,
    suggestedActions: ['記錄座位偏好'],
  };
}

/**
 * 問候處理
 */
async function handleGreeting(message, entities, context) {
  const greetings = [
    '您好！我是金龍旅遊 AI 助理，很高興為您服務。請問有什麼可以幫您的嗎？',
    '您好！歡迎聯繫金龍旅遊。請問需要什麼協助呢？',
    '嗨！我是金龍旅遊的 AI 客服，請問有什麼可以為您服務的？',
  ];

  // 根據具體問候語回應
  if (message.includes('謝謝') || message.includes('感謝')) {
    return {
      message: '不客氣！很高興能幫上忙。如有其他問題，隨時可以詢問喔！',
      requiresHuman: false,
      suggestedActions: [],
    };
  }

  if (message.includes('收到') || message.includes('好的') || message.includes('了解')) {
    return {
      message: '好的，如有其他問題隨時告訴我！',
      requiresHuman: false,
      suggestedActions: [],
    };
  }

  return {
    message: greetings[Math.floor(Math.random() * greetings.length)],
    requiresHuman: false,
    suggestedActions: [],
  };
}

/**
 * 轉人工處理
 */
async function handleTransferAgent(message, entities, context) {
  return {
    message: `好的，我來為您轉接人工客服。

服務時間：週一至週五 9:00-18:00

如在非上班時間有緊急需求（72小時內出發），請撥打：
📞 0988-157-972

請稍候，客服人員會盡快與您聯繫。`,
    requiresHuman: true,
    suggestedActions: ['轉接人工客服'],
  };
}

/**
 * 一般 FAQ 處理
 */
async function handleFaqGeneral(message, entities, context) {
  const faqResult = await faqAutoReply(message);

  return {
    message: faqResult.reply,
    requiresHuman: !faqResult.success,
    suggestedActions: [],
  };
}

/**
 * 未知意圖處理
 */
async function handleUnknown(message, entities, context) {
  // 嘗試用 FAQ 回答
  const faqResult = await faqAutoReply(message);

  if (faqResult.success && faqResult.metadata?.matchedFAQs?.length > 0) {
    return {
      message: faqResult.reply,
      requiresHuman: false,
      suggestedActions: [],
    };
  }

  return {
    message: `抱歉，我不太確定您的需求。您可以：

1. 訂票/改票/退票
2. 查詢航班或票價
3. 簽證諮詢
4. 付款或索取收據

或者，請直接描述您的需求，我會盡力協助您。

如需人工服務，請告訴我「找真人」。`,
    requiresHuman: false,
    suggestedActions: [],
  };
}

export default {
  handleMessage,
  getSessionContext,
  clearSession,
};
