/**
 * 金龍永盛 AI 客服系統 - 意圖處理路由器
 *
 * 根據識別的意圖，路由到對應的處理函數
 * 支援資料庫和記憶體兩種 Session 模式
 */
import { classifyIntent, INTENTS } from './intentClassifier.js';
import { extractAllEntities, flattenEntities } from './entityExtractor.js';
// faqAutoReply 已移除，改用直接 FAQ 查詢以提升效能
import { searchFAQ, formatFAQContext } from './faqRetriever.js';
import { getConversationHistory } from './services/conversationService.js';

// ============ Session 管理 ============

// 簡易記憶體儲存（作為後備方案，主要使用資料庫）
const sessions = new Map();

// ============ 對話狀態管理 ============

/**
 * 對話狀態結構
 * @typedef {Object} ConversationState
 * @property {string} currentIntent - 當前意圖
 * @property {string[]} awaitingInfo - 等待的資訊類型
 * @property {Object} collectedInfo - 已收集的資訊
 * @property {string} lastQuestion - 上次問的問題
 * @property {Date} lastAskedAt - 上次詢問時間
 */

/**
 * 需要收集資訊的意圖及其對應的等待欄位
 */
const INTENT_AWAITING_INFO = {
  TICKET_BOOK: ['DATE', 'DESTINATION', 'PASSENGERS', 'BOOKING_REF'],
  TICKET_CHANGE: ['DATE', 'FLIGHT_NO', 'DIRECTION', 'CLASS', 'BOOKING_REF', 'PASSENGER_NAME'],
  TICKET_CANCEL: ['BOOKING_REF', 'PASSENGER_NAME'],
  QUOTE_REQUEST: ['DESTINATION', 'DATE', 'PASSENGERS', 'CLASS'],
  FLIGHT_QUERY: ['DESTINATION', 'DATE', 'AIRLINE'],
  BOOKING_STATUS: ['BOOKING_REF', 'PASSENGER_NAME'],
  VISA_INQUIRY: ['DESTINATION'],
  VISA_PROGRESS: ['PASSPORT_TYPE', 'PASSENGER_NAME'],
  PAYMENT_REQUEST: ['BOOKING_REF'],
  RECEIPT_REQUEST: ['TAX_ID'],
  SEAT_REQUEST: ['SEAT_PREFERENCE'],
};

/**
 * 判斷訊息是否像是在提供資訊（而非新的請求）
 * @param {string} message - 用戶訊息
 * @returns {Object} { isInfoProviding: boolean, detectedTypes: string[] }
 */
function detectInfoProviding(message) {
  const detectedTypes = [];
  const msg = message.trim();

  // 日期模式
  if (/^\d{1,2}\/\d{1,2}$/.test(msg) || // 3/26
      /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(msg) || // 2025/3/26
      /^(明天|後天|下週|下個月|大後天)/.test(msg) ||
      /^\d{1,2}月\d{1,2}[日號]?$/.test(msg)) {
    detectedTypes.push('DATE');
  }

  // 目的地模式（常見城市）
  const destinations = ['東京', '大阪', '首爾', '曼谷', '新加坡', '香港', '澳門', '上海', '北京', '吉隆坡', '胡志明', '河內', '峇里島', '普吉島', '沖繩', '福岡', '名古屋', '釜山', '濟州'];
  if (destinations.some(d => msg.includes(d)) || /^[A-Z]{3}$/.test(msg)) {
    detectedTypes.push('DESTINATION');
  }

  // 人數模式
  if (/^[1-9]位?$/.test(msg) || /^[一二三四五六七八九十]位$/.test(msg) || /^\d+個人$/.test(msg)) {
    detectedTypes.push('PASSENGERS');
  }

  // 航班號模式
  if (/^[A-Z]{2}\d{2,4}$/.test(msg.toUpperCase())) {
    detectedTypes.push('FLIGHT_NO');
  }

  // 訂位代號模式
  if (/^[A-Z]{3}\d{6,8}$/i.test(msg)) {
    detectedTypes.push('BOOKING_REF');
  }

  // 艙等模式
  if (/商務|經濟|頭等|business|economy/i.test(msg)) {
    detectedTypes.push('CLASS');
  }

  // 方向模式
  if (/去程|回程|outbound|inbound/i.test(msg)) {
    detectedTypes.push('DIRECTION');
  }

  // 座位偏好
  if (/靠窗|走道|前排|後排|逃生門/i.test(msg)) {
    detectedTypes.push('SEAT_PREFERENCE');
  }

  // 確認語（保持意圖，不需額外處理）
  if (/^(好|好的|OK|可以|對|沒問題|是的|嗯|確認|確定|沒錯|對的|正確)$/i.test(msg) ||
      /^確認/.test(msg) ||  // 以「確認」開頭的訊息
      /^(是|對|好)(的|啊|呀)?$/.test(msg)) {
    detectedTypes.push('CONFIRMATION');
  }

  // 短訊息判斷（10 字以內且不是問句）
  const isShort = msg.length <= 10 && !msg.includes('?') && !msg.includes('？') && !msg.includes('嗎');

  return {
    isInfoProviding: detectedTypes.length > 0 || isShort,
    detectedTypes,
    isShort,
  };
}

/**
 * 檢查是否應該延續上一個意圖
 * @param {Object} session - Session 物件
 * @param {string} userMessage - 用戶訊息
 * @param {Object} infoDetection - detectInfoProviding 的結果
 * @returns {Object|null} { shouldContinue: boolean, intent: string }
 */
function checkIntentContinuation(session, userMessage, infoDetection) {
  const state = session.conversationState;

  // 沒有對話狀態，不延續
  if (!state || !state.currentIntent) {
    return null;
  }

  // 檢查時間間隔（5 分鐘內的對話才延續）
  const timeDiff = Date.now() - new Date(state.lastAskedAt).getTime();
  if (timeDiff > 5 * 60 * 1000) {
    return null;
  }

  // 檢查是否在等待資訊
  if (!state.awaitingInfo || state.awaitingInfo.length === 0) {
    return null;
  }

  // 如果偵測到的資訊類型符合等待的類型，延續意圖
  const matchedTypes = infoDetection.detectedTypes.filter(t =>
    state.awaitingInfo.includes(t) || t === 'CONFIRMATION'
  );

  if (matchedTypes.length > 0 || (infoDetection.isShort && state.awaitingInfo.length > 0)) {
    return {
      shouldContinue: true,
      intent: state.currentIntent,
      matchedTypes,
    };
  }

  return null;
}

/**
 * 更新對話狀態
 * @param {Object} session - Session 物件
 * @param {string} intent - 意圖
 * @param {string[]} awaitingInfo - 等待的資訊
 * @param {Object} collectedInfo - 收集到的資訊
 * @param {string} lastQuestion - 上次問的問題
 */
function updateConversationState(session, intent, awaitingInfo, collectedInfo = {}, lastQuestion = '') {
  session.conversationState = {
    currentIntent: intent,
    awaitingInfo: awaitingInfo || [],
    collectedInfo: {
      ...session.conversationState?.collectedInfo,
      ...collectedInfo,
    },
    lastQuestion,
    lastAskedAt: new Date(),
  };
}

/**
 * 清除對話狀態（當意圖完成或切換時）
 */
function clearConversationState(session) {
  session.conversationState = null;
}

/**
 * 判斷 sessionId 是否為 UUID（資料庫對話 ID）
 */
function isUUID(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * 取得或創建 session（支援資料庫和記憶體）
 * @param {string} sessionId - Session ID 或 Conversation ID
 * @returns {Object} session 物件
 */
async function getOrCreateSession(sessionId) {
  // 如果是 UUID，嘗試從資料庫取得對話歷史
  if (isUUID(sessionId)) {
    try {
      const history = await getConversationHistory(sessionId, 20);

      // 檢查記憶體中是否有額外的實體資訊和對話狀態
      const memorySession = sessions.get(sessionId);

      return {
        id: sessionId,
        history,
        entities: memorySession?.entities || {},
        conversationState: memorySession?.conversationState || null,  // 保留對話狀態
        isFromDatabase: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.warn('⚠️ 無法從資料庫取得對話歷史，使用記憶體模式:', error.message);
    }
  }

  // 後備：使用記憶體 session
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      history: [],
      entities: {},
      isFromDatabase: false,
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
 * 注意：當使用資料庫模式時，訊息已在 lineHandler 中儲存，
 * 這裡只更新記憶體 session（用於非資料庫模式）
 */
function updateSessionHistory(sessionId, userMessage, response, isFromDatabase = false) {
  // 如果是資料庫模式，不需要更新記憶體 session
  // 因為訊息已經儲存到資料庫了
  if (isFromDatabase) {
    return;
  }

  // 記憶體模式：更新 session
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      history: [],
      entities: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const session = sessions.get(sessionId);
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

  // 取得或創建 session（現在支援從資料庫讀取）
  const session = await getOrCreateSession(sessionId);
  if (userId) {
    session.userId = userId;
  }

  try {
    // 0. 檢查是否應該延續上一個意圖（多輪對話處理）
    const infoDetection = detectInfoProviding(userMessage);
    const continuation = checkIntentContinuation(session, userMessage, infoDetection);

    let intentResult;
    let isContinuation = false;

    if (continuation && continuation.shouldContinue) {
      // 延續上一個意圖，不重新分類
      console.log(`🔄 延續意圖: ${continuation.intent}（偵測到: ${continuation.matchedTypes.join(', ')}）`);
      isContinuation = true;
      intentResult = {
        success: true,
        intent: continuation.intent,
        intentName: INTENTS[continuation.intent]?.name || '延續對話',
        category: INTENTS[continuation.intent]?.category || '對話管理',
        confidence: 0.9,
        entities: {},
        isContinuation: true,
      };
    } else {
      // 1. 意圖分類（傳入對話歷史以提供上下文）
      intentResult = await classifyIntent(userMessage, session.history || []);
    }

    // 2. 規則式實體提取（補充 LLM 提取的實體）
    const ruleBasedEntities = extractAllEntities(userMessage);
    const flatEntities = flattenEntities(ruleBasedEntities);

    // 合併實體（LLM 提取 + 規則提取 + 對話狀態中收集的實體）
    const mergedEntities = {
      ...session.conversationState?.collectedInfo,  // 對話狀態中已收集的資訊
      ...session.entities,  // 保留 session 中已收集的實體
      ...flatEntities,
      ...intentResult.entities,
    };

    // 更新 session 實體
    session.entities = mergedEntities;

    // 3. 根據意圖路由到處理器
    const handler = getIntentHandler(intentResult.intent);
    const response = await handler(userMessage, mergedEntities, session, isContinuation);

    const processingTime = Date.now() - startTime;

    // 4. 更新對話狀態（多輪對話追蹤）
    if (response.awaitingInfo && response.awaitingInfo.length > 0) {
      // 還有資訊需要收集，更新狀態
      updateConversationState(
        session,
        intentResult.intent,
        response.awaitingInfo,
        mergedEntities,
        response.lastQuestion || ''
      );
      console.log(`📝 等待資訊: ${response.awaitingInfo.join(', ')}`);
    } else if (response.conversationComplete) {
      // 對話流程完成，清除狀態
      clearConversationState(session);
      console.log('✅ 對話流程完成');
    }

    // 保存 session 到記憶體（確保跨請求狀態保持）
    sessions.set(sessionId, session);

    // 5. 更新對話歷史（資料庫模式時會跳過，因為訊息已在 lineHandler 中儲存）
    updateSessionHistory(sessionId, userMessage, response.message, session.isFromDatabase);

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
      isContinuation,
      awaitingInfo: response.awaitingInfo || [],
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
async function handleTicketBook(message, entities, context, isContinuation = false) {
  let response = '';
  const suggestedActions = [];
  const awaitingInfo = [];

  // 檢查是否為確認回覆（延續對話且用戶確認）
  const isConfirmation = isContinuation &&
    (message.includes('確認') || message.includes('確定') ||
     /^(好|好的|對|對的|是|是的|OK|可以|沒問題|嗯|沒錯|正確)$/i.test(message.trim()));

  // 如果用戶確認，從 entities 或 collectedInfo 取得資訊來完成訂票
  if (isConfirmation) {
    // 優先從 entities 取（包含合併後的所有資訊），其次從 collectedInfo
    const collectedInfo = context.conversationState?.collectedInfo || {};
    const dest = entities.destination || entities.DESTINATION || collectedInfo.destination;
    const dt = entities.date || entities.DATE || collectedInfo.date;
    const pax = entities.passengers || entities.PASSENGERS || collectedInfo.passengers;

    console.log(`🔍 確認檢查: dest=${dest}, date=${dt}, pax=${pax}`);

    if (dest && dt && pax) {
      response = `好的，已確認您的訂票需求：
- 目的地：${dest}
- 日期：${dt}
- 人數：${pax}

我會為您查詢航班並提供報價，請稍候。專人會盡快與您聯繫！`;
      suggestedActions.push('查詢航班', '提供報價');

      return {
        message: response,
        requiresHuman: true,
        suggestedActions,
        conversationComplete: true,
      };
    }
  }

  // 檢查已收集的資訊
  const hasBookingRef = entities.booking_ref || entities.BOOKING_REF;
  const hasDestination = entities.destination || entities.DESTINATION;
  const hasDate = entities.date || entities.DATE;
  const hasPassengers = entities.passengers || entities.PASSENGERS;

  if (hasBookingRef) {
    // 有訂位代號，可以開票
    response = `好的，我已收到您的開票請求。
訂位代號：${hasBookingRef}
${hasDestination ? `目的地：${hasDestination}` : ''}

請稍候，我會確認訂位資訊後為您處理開票。確認後會再通知您付款方式。`;
    suggestedActions.push('確認訂位資訊', '發送付款連結');

    return {
      message: response,
      requiresHuman: true,
      suggestedActions,
      conversationComplete: true,  // 資訊收集完成
    };
  }

  // 根據已有資訊決定下一步詢問
  if (isContinuation) {
    // 是延續對話，確認收到資訊
    const collectedItems = [];
    if (hasDestination) collectedItems.push(`目的地：${hasDestination}`);
    if (hasDate) collectedItems.push(`日期：${hasDate}`);
    if (hasPassengers) collectedItems.push(`人數：${hasPassengers}`);

    if (collectedItems.length > 0) {
      response = `好的，已記錄：\n${collectedItems.join('\n')}\n\n`;
    }
  }

  // 判斷還缺什麼資訊
  const missingInfo = [];
  if (!hasDate) {
    missingInfo.push('出發日期');
    awaitingInfo.push('DATE');
  }
  if (!hasDestination) {
    missingInfo.push('目的地');
    awaitingInfo.push('DESTINATION');
  }
  if (!hasPassengers) {
    missingInfo.push('旅客人數');
    awaitingInfo.push('PASSENGERS');
  }

  if (missingInfo.length > 0) {
    if (!isContinuation) {
      response = `好的，我來協助您訂票。`;
    }
    response += `請提供${missingInfo.slice(0, 2).join('和')}？`;
    if (missingInfo.length > 2) {
      response += `\n\n（還需要：${missingInfo.slice(2).join('、')}）`;
    }
  } else {
    // 資訊都有了，等待用戶確認
    response += `好的，已收集到以下訂票資訊：
- 目的地：${hasDestination}
- 日期：${hasDate}
- 人數：${hasPassengers}

請確認以上資訊是否正確？確認後我會為您查詢航班並報價。`;
    suggestedActions.push('確認', '修改資訊');
    awaitingInfo.push('CONFIRMATION');  // 等待用戶確認

    return {
      message: response,
      requiresHuman: false,  // 還不需要轉人工，等確認後再轉
      suggestedActions,
      awaitingInfo,
      lastQuestion: '請確認訂票資訊',
    };
  }

  return {
    message: response,
    requiresHuman: awaitingInfo.length === 0,
    suggestedActions,
    awaitingInfo,
    lastQuestion: response,
  };
}

/**
 * 改票請求處理
 */
async function handleTicketChange(message, entities, context, isContinuation = false) {
  let response = '';
  const awaitingInfo = [];

  // 檢查已收集的資訊
  const hasDate = entities.date || entities.DATE;
  const hasFlightNo = entities.flight_no || entities.FLIGHT_NO;
  const hasDirection = entities.direction || entities.DIRECTION;
  const hasClass = entities.class || entities.CLASS;
  const hasBookingRef = entities.booking_ref || entities.BOOKING_REF;
  const hasPassengerName = entities.passenger_name || entities.PASSENGER_NAME;

  // 顯示已收集的資訊
  const collectedItems = [];
  if (hasDate) collectedItems.push(`新日期：${hasDate}`);
  if (hasFlightNo) collectedItems.push(`新航班：${hasFlightNo}`);
  if (hasDirection) {
    const dirText = hasDirection === 'OUTBOUND' || hasDirection === '去程' ? '去程' : '回程';
    collectedItems.push(`航段：${dirText}`);
  }
  if (hasClass) {
    const classText = hasClass === 'BUSINESS' ? '商務艙' : hasClass === 'ECONOMY' ? '經濟艙' : hasClass;
    collectedItems.push(`艙等：${classText}`);
  }

  if (isContinuation && collectedItems.length > 0) {
    response = `好的，已記錄：\n${collectedItems.join('\n')}\n\n`;
  } else if (!isContinuation) {
    response = '好的，我來協助您改票。\n\n';
    if (collectedItems.length > 0) {
      response += collectedItems.join('\n') + '\n\n';
    }
  }

  // 檢查是否有訂位代號或旅客姓名
  if (!hasBookingRef && !hasPassengerName) {
    response += `改票可能會產生費用（約 TWD 800-3,300），實際費用需視票種規定而定。\n\n請提供訂位代號或旅客姓名，以便查詢您的訂位。`;
    awaitingInfo.push('BOOKING_REF', 'PASSENGER_NAME');

    return {
      message: response,
      requiresHuman: true,
      suggestedActions: ['查詢改票費用'],
      awaitingInfo,
      lastQuestion: response,
    };
  }

  // 有訂位代號，檢查改票詳情
  if (!hasDate && !hasFlightNo && !hasDirection) {
    response += `請問您要改成什麼日期或航班？`;
    awaitingInfo.push('DATE', 'FLIGHT_NO');

    return {
      message: response,
      requiresHuman: true,
      suggestedActions: [],
      awaitingInfo,
      lastQuestion: response,
    };
  }

  // 資訊足夠，可以處理
  response += `改票資訊已收集完成：
${hasBookingRef ? `- 訂位代號：${hasBookingRef}` : `- 旅客：${hasPassengerName}`}
${collectedItems.map(item => `- ${item}`).join('\n')}

改票可能會產生費用（約 TWD 800-3,300）。我會轉請專人為您處理。`;

  return {
    message: response,
    requiresHuman: true,
    suggestedActions: ['查詢改票費用', '確認改票'],
    conversationComplete: true,
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
async function handleQuoteRequest(message, entities, context, isContinuation = false) {
  let response = '';
  const awaitingInfo = [];

  // 檢查已收集的資訊
  const hasDestination = entities.destination || entities.DESTINATION;
  const hasDate = entities.date || entities.DATE;
  const hasClass = entities.class || entities.CLASS;
  const hasPassengers = entities.passengers || entities.PASSENGERS;

  // 收集已有資訊
  const collectedItems = [];
  if (hasDestination) collectedItems.push(`目的地：${hasDestination}`);
  if (hasDate) collectedItems.push(`日期：${hasDate}`);
  if (hasClass) {
    const classText = hasClass === 'BUSINESS' ? '商務艙' : '經濟艙';
    collectedItems.push(`艙等：${classText}`);
  }
  if (hasPassengers) collectedItems.push(`人數：${hasPassengers}`);

  if (isContinuation && collectedItems.length > 0) {
    response = `好的，已記錄：\n${collectedItems.join('\n')}\n\n`;
  } else if (!isContinuation) {
    response = '好的，我來為您查詢票價。\n\n';
    if (collectedItems.length > 0) {
      response += collectedItems.join('\n') + '\n\n';
    }
  }

  // 檢查缺少的資訊
  if (!hasDestination) {
    awaitingInfo.push('DESTINATION');
  }
  if (!hasDate) {
    awaitingInfo.push('DATE');
  }

  if (awaitingInfo.length > 0) {
    const missingItems = [];
    if (!hasDestination) missingItems.push('目的地');
    if (!hasDate) missingItems.push('出發日期');

    response += `請提供${missingItems.join('和')}？`;

    return {
      message: response,
      requiresHuman: false,
      suggestedActions: [],
      awaitingInfo,
      lastQuestion: response,
    };
  }

  // 資訊足夠
  response += `好的，查詢條件：
- 目的地：${hasDestination}
- 日期：${hasDate}
${hasClass ? `- 艙等：${hasClass === 'BUSINESS' ? '商務艙' : '經濟艙'}` : ''}
${hasPassengers ? `- 人數：${hasPassengers}` : ''}

請稍候，我會為您查詢票價並報價。

（目前系統尚未串接 GDS，票價查詢功能開發中。請稍候由專人報價。）`;

  return {
    message: response,
    requiresHuman: true,
    suggestedActions: ['提供詳細報價'],
    conversationComplete: true,
  };
}

/**
 * 航班查詢處理
 */
async function handleFlightQuery(message, entities, context, isContinuation = false) {
  let response = '';
  const awaitingInfo = [];

  const hasDestination = entities.destination || entities.DESTINATION;
  const hasDate = entities.date || entities.DATE;
  const hasAirline = entities.airline || entities.AIRLINE;

  const collectedItems = [];
  if (hasDestination) collectedItems.push(`目的地：${hasDestination}`);
  if (hasDate) collectedItems.push(`日期：${hasDate}`);
  if (hasAirline) collectedItems.push(`航空公司：${hasAirline}`);

  if (isContinuation && collectedItems.length > 0) {
    response = `好的，已記錄：\n${collectedItems.join('\n')}\n\n`;
  } else if (!isContinuation) {
    response = '好的，我來為您查詢航班。\n\n';
    if (collectedItems.length > 0) {
      response += collectedItems.join('\n') + '\n\n';
    }
  }

  if (!hasDestination) {
    awaitingInfo.push('DESTINATION');
    response += '請問您要飛往哪裡？';
    return {
      message: response,
      requiresHuman: false,
      awaitingInfo,
      lastQuestion: response,
    };
  }

  if (!hasDate) {
    awaitingInfo.push('DATE');
    response += '請問您預計什麼時候出發？';
    return {
      message: response,
      requiresHuman: false,
      awaitingInfo,
      lastQuestion: response,
    };
  }

  response += `好的，我會為您查詢前往 ${hasDestination}、${hasDate} 的航班。

（目前系統尚未串接 GDS，航班查詢功能開發中。請稍候由專人查詢。）`;

  return {
    message: response,
    requiresHuman: true,
    suggestedActions: ['查詢航班'],
    conversationComplete: true,
  };
}

/**
 * 訂位狀態查詢處理
 */
async function handleBookingStatus(message, entities, context, isContinuation = false) {
  const hasBookingRef = entities.booking_ref || entities.BOOKING_REF;
  const hasPassengerName = entities.passenger_name || entities.PASSENGER_NAME;

  if (hasBookingRef || hasPassengerName) {
    const identifier = hasBookingRef ? `訂位代號 ${hasBookingRef}` : `旅客 ${hasPassengerName}`;

    return {
      message: `好的，我來查詢${identifier}的狀態。

（目前系統尚未串接內部訂位系統，請稍候由專人為您確認。）`,
      requiresHuman: true,
      suggestedActions: ['查詢訂位狀態'],
      conversationComplete: true,
    };
  }

  return {
    message: isContinuation
      ? '請提供訂位代號或旅客姓名？'
      : `請提供您的訂位代號或旅客姓名，我來為您查詢訂位狀態。

訂位代號格式範例：BTE2500208`,
    requiresHuman: false,
    suggestedActions: [],
    awaitingInfo: ['BOOKING_REF', 'PASSENGER_NAME'],
    lastQuestion: '請提供訂位代號或旅客姓名',
  };
}

/**
 * 簽證諮詢處理 - 直接使用 FAQ（不再呼叫 Gemini）
 */
async function handleVisaInquiry(message, entities, context) {
  const hasDestination = entities.destination || entities.DESTINATION;

  // 直接搜尋 FAQ（不呼叫 Gemini，節省 1.5 秒）
  const faqs = searchFAQ(message);

  if (faqs.length > 0) {
    // 直接使用最佳匹配的 FAQ 回覆
    const bestFaq = faqs[0];
    return {
      message: bestFaq.answer,
      requiresHuman: false,
      suggestedActions: [],
    };
  }

  // 沒有 FAQ 匹配，使用預設回覆
  let response = '關於簽證問題，以下是一些常見資訊：\n\n';

  if (hasDestination) {
    // 根據目的地提供常見資訊
    const visaInfo = {
      '泰國': '持台灣護照前往泰國觀光，目前享有免簽待遇，可停留最長60天。',
      '日本': '持台灣護照前往日本觀光免簽證，可停留90天。',
      '韓國': '持台灣護照前往韓國觀光免簽證，可停留90天。',
      '新加坡': '持台灣護照前往新加坡觀光免簽證，可停留30天。',
      '香港': '持台灣護照前往香港需申請入境許可（台胞證或網簽）。',
      '澳門': '持台灣護照前往澳門可停留30天，無需簽證。',
      '中國': '前往中國大陸需辦理台胞證。一般件約5-7工作天，急件約3工作天。',
    };

    const info = visaInfo[hasDestination];
    if (info) {
      response = info;
    } else {
      response += `您詢問的是前往${hasDestination}的簽證資訊。請稍候，我會請專人為您確認。`;
    }
  } else {
    response += `常見諮詢：
- 台胞證：辦理約5-7工作天
- 泰國：免簽60天
- 日本/韓國：免簽90天
- 申根區：免簽90天

請告知您的目的地，我會為您查詢詳細資訊。`;
  }

  return {
    message: response,
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
 * 行李查詢處理 - 直接回覆（不呼叫 Gemini）
 */
async function handleBaggageInquiry(message, entities, context) {
  const hasAirline = entities.airline || entities.AIRLINE;
  const hasClass = entities.class || entities.CLASS;

  // 常見航空公司行李規定
  const baggageInfo = {
    '國泰': { economy: '23公斤x1件', business: '32公斤x2件' },
    '長榮': { economy: '23公斤x1件', business: '32公斤x2件' },
    '華航': { economy: '23公斤x1件', business: '32公斤x2件' },
    '星宇': { economy: '23公斤x1件', business: '32公斤x2件' },
    '虎航': { economy: '20公斤（需加購）', business: '-' },
    '樂桃': { economy: '20公斤（需加購）', business: '-' },
    '亞航': { economy: '20公斤（需加購）', business: '-' },
  };

  let response = '關於行李規定：\n\n';

  if (hasAirline && baggageInfo[hasAirline]) {
    const info = baggageInfo[hasAirline];
    response = `${hasAirline}航空行李規定：
- 經濟艙：${info.economy}
- 商務艙：${info.business}

手提行李：7公斤，尺寸 56x36x23 公分以內`;
  } else {
    response += `一般航空公司規定：
- 經濟艙：23公斤 x 1件
- 商務艙：32公斤 x 2件
- 手提行李：7公斤

廉價航空（虎航、樂桃等）需另外加購託運行李。

${hasAirline ? `您詢問的是${hasAirline}的規定，請稍候確認。` : '請問您是搭乘哪家航空公司？'}`;
  }

  return {
    message: response,
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
 * 一般 FAQ 處理 - 直接使用 FAQ（不呼叫 Gemini）
 */
async function handleFaqGeneral(message, entities, context) {
  // 直接搜尋 FAQ（不呼叫 Gemini，節省 1.5 秒）
  const faqs = searchFAQ(message);

  if (faqs.length > 0) {
    return {
      message: faqs[0].answer,
      requiresHuman: false,
      suggestedActions: [],
    };
  }

  // 沒有 FAQ 匹配
  return {
    message: '這個問題我需要請專人為您處理，請稍候。',
    requiresHuman: true,
    suggestedActions: [],
  };
}

/**
 * 未知意圖處理 - 直接使用 FAQ（不呼叫 Gemini）
 */
async function handleUnknown(message, entities, context) {
  // 直接搜尋 FAQ（不呼叫 Gemini，節省 1.5 秒）
  const faqs = searchFAQ(message);

  if (faqs.length > 0) {
    return {
      message: faqs[0].answer,
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
