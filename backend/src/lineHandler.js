/**
 * 金龍永盛 AI 客服系統 - LINE Messaging API 處理模組
 *
 * 處理 LINE Webhook 事件，整合意圖分類和自動回覆
 * 支援資料庫持久化和客服工作台整合
 */
import crypto from 'crypto';
import { config } from './config.js';
import { handleMessage } from './intentRouter.js';
import { faqAutoReply } from './gemini.js';
import { prisma } from './db.js';
import {
  getOrCreateCustomer,
  getOrCreateConversation,
  saveMessage,
  getConversation,
} from './services/conversationService.js';
import { isWithinWorkingHours, getOffHoursMessage } from './services/workingHoursService.js';
import { handoffToHuman, markOffHoursPending, getPriorityByVipLevel } from './services/humanHandoffService.js';
import { generateAndSaveSuggestedReply } from './services/aiSuggestionService.js';

// LINE API 設定
const LINE_API_BASE = 'https://api.line.me/v2/bot';

/**
 * 驗證 LINE Webhook 簽名（單渠道）
 * @param {string} body - 請求原始內容
 * @param {string} signature - X-Line-Signature header
 * @returns {boolean} 簽名是否有效
 */
export function verifySignature(body, signature) {
  if (!config.line?.channelSecret) {
    console.warn('⚠️ LINE Channel Secret 未設定，跳過簽名驗證');
    return true; // 開發環境可跳過
  }

  const hash = crypto
    .createHmac('SHA256', config.line.channelSecret)
    .update(body)
    .digest('base64');

  return hash === signature;
}

/**
 * 驗證 LINE Webhook 簽名（多渠道支援）
 * 嘗試所有區域的 channelSecret 來驗證簽名
 * @param {string} body - 請求原始內容
 * @param {string} signature - X-Line-Signature header
 * @returns {Promise<Object|null>} 匹配的區域資料，或 null 表示驗證失敗
 */
export async function verifySignatureMultiChannel(body, signature) {
  try {
    // 取得所有活躍區域
    const regions = await prisma.region.findMany({
      where: { isActive: true },
    });

    // 嘗試每個區域的 secret
    for (const region of regions) {
      if (!region.lineChannelSecret) continue;

      const hash = crypto
        .createHmac('SHA256', region.lineChannelSecret)
        .update(body)
        .digest('base64');

      if (hash === signature) {
        console.log(`✅ 簽名驗證成功，區域: ${region.name} (${region.code})`);
        return region;
      }
    }

    // 如果都不匹配，嘗試全域配置（向後兼容）
    if (config.line?.channelSecret) {
      const hash = crypto
        .createHmac('SHA256', config.line.channelSecret)
        .update(body)
        .digest('base64');

      if (hash === signature) {
        console.log('✅ 簽名驗證成功（使用全域配置）');
        return { id: null, useGlobalConfig: true };
      }
    }

    console.error('❌ 簽名驗證失敗，無匹配的區域');
    return null;
  } catch (error) {
    console.error('❌ 多渠道簽名驗證錯誤:', error);
    return null;
  }
}

/**
 * 回覆 LINE 訊息
 * @param {string} replyToken - LINE reply token
 * @param {Array|Object} messages - 要發送的訊息（單個或多個）
 */
export async function replyMessage(replyToken, messages) {
  if (!config.line?.channelAccessToken) {
    console.error('❌ LINE Channel Access Token 未設定');
    return { success: false, error: 'Channel Access Token 未設定' };
  }

  // 確保是陣列格式
  const messageArray = Array.isArray(messages) ? messages : [messages];

  try {
    const response = await fetch(`${LINE_API_BASE}/message/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.line.channelAccessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: messageArray,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ LINE API 錯誤:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('❌ 發送 LINE 訊息失敗:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主動推送訊息給用戶
 * @param {string} userId - LINE 用戶 ID
 * @param {Array|Object} messages - 要發送的訊息
 */
export async function pushMessage(userId, messages) {
  if (!config.line?.channelAccessToken) {
    console.error('❌ LINE Channel Access Token 未設定');
    return { success: false, error: 'Channel Access Token 未設定' };
  }

  const messageArray = Array.isArray(messages) ? messages : [messages];

  try {
    const response = await fetch(`${LINE_API_BASE}/message/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.line.channelAccessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: messageArray,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ LINE Push API 錯誤:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('❌ 推送 LINE 訊息失敗:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 回覆 LINE 訊息（多渠道版本）
 * @param {string} replyToken - LINE reply token
 * @param {Array|Object} messages - 要發送的訊息
 * @param {Object} region - 區域資料（包含 lineChannelAccessToken）
 */
export async function replyMessageWithRegion(replyToken, messages, region) {
  const accessToken = region?.useGlobalConfig
    ? config.line?.channelAccessToken
    : region?.lineChannelAccessToken;

  if (!accessToken) {
    console.error('❌ LINE Channel Access Token 未設定');
    return { success: false, error: 'Channel Access Token 未設定' };
  }

  const messageArray = Array.isArray(messages) ? messages : [messages];

  try {
    const response = await fetch(`${LINE_API_BASE}/message/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: messageArray,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ LINE API 錯誤:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('❌ 發送 LINE 訊息失敗:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 主動推送訊息（多渠道版本）
 * @param {string} userId - LINE 用戶 ID
 * @param {Array|Object} messages - 要發送的訊息
 * @param {Object} region - 區域資料
 */
export async function pushMessageWithRegion(userId, messages, region) {
  const accessToken = region?.useGlobalConfig
    ? config.line?.channelAccessToken
    : region?.lineChannelAccessToken;

  if (!accessToken) {
    console.error('❌ LINE Channel Access Token 未設定');
    return { success: false, error: 'Channel Access Token 未設定' };
  }

  const messageArray = Array.isArray(messages) ? messages : [messages];

  try {
    const response = await fetch(`${LINE_API_BASE}/message/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: messageArray,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ LINE Push API 錯誤:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('❌ 推送 LINE 訊息失敗:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 取得用戶資料（多渠道版本）
 * @param {string} userId - LINE 用戶 ID
 * @param {Object} region - 區域資料
 */
export async function getUserProfileWithRegion(userId, region) {
  const accessToken = region?.useGlobalConfig
    ? config.line?.channelAccessToken
    : region?.lineChannelAccessToken;

  if (!accessToken) {
    return null;
  }

  try {
    const response = await fetch(`${LINE_API_BASE}/profile/${userId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('❌ 取得用戶資料失敗:', error);
    return null;
  }
}

/**
 * 建立文字訊息物件
 * @param {string} text - 文字內容
 */
export function createTextMessage(text) {
  return {
    type: 'text',
    text: text.slice(0, 5000), // LINE 文字訊息上限 5000 字
  };
}

/**
 * 建立圖片訊息物件
 * @param {string} imageUrl - 圖片 URL（必須是 HTTPS）
 * @param {string} [previewUrl] - 預覽圖 URL（可選，預設使用原圖）
 */
export function createImageMessage(imageUrl, previewUrl = null) {
  return {
    type: 'image',
    originalContentUrl: imageUrl,
    previewImageUrl: previewUrl || imageUrl,
  };
}

/**
 * 建立快速回覆按鈕
 * @param {string} text - 主要訊息
 * @param {Array} items - 快速回覆項目 [{label, text}]
 */
export function createQuickReply(text, items) {
  return {
    type: 'text',
    text,
    quickReply: {
      items: items.map(item => ({
        type: 'action',
        action: {
          type: 'message',
          label: item.label.slice(0, 20), // 標籤上限 20 字
          text: item.text,
        },
      })),
    },
  };
}

/**
 * 建立確認模板
 * @param {string} text - 確認訊息
 * @param {Object} yes - 確認按鈕 {label, text}
 * @param {Object} no - 取消按鈕 {label, text}
 */
export function createConfirmTemplate(text, yes, no) {
  return {
    type: 'template',
    altText: text,
    template: {
      type: 'confirm',
      text,
      actions: [
        { type: 'message', label: yes.label, text: yes.text },
        { type: 'message', label: no.label, text: no.text },
      ],
    },
  };
}

/**
 * 處理 LINE Webhook 事件
 * @param {Object} event - LINE webhook event
 * @returns {Object} 處理結果
 */
export async function handleLineEvent(event) {
  const { type, replyToken, source, message } = event;

  // 只處理文字訊息
  if (type !== 'message' || message?.type !== 'text') {
    console.log(`⏭️ 跳過非文字事件: ${type}/${message?.type}`);
    return { success: true, skipped: true };
  }

  const userId = source?.userId;
  const sessionId = userId || 'anonymous';
  const userMessage = message.text;

  console.log(`📩 收到 LINE 訊息 [${sessionId}]: ${userMessage}`);

  try {
    // 使用意圖路由器處理訊息
    const result = await handleMessage(userMessage, sessionId, userId);

    // 構建回覆訊息
    let replyMessages = [];

    if (result.success) {
      // 主要回覆
      replyMessages.push(createTextMessage(result.reply));

      // 如果需要轉人工，加上提示
      if (result.requiresHuman) {
        replyMessages.push(createTextMessage(
          '💡 此問題可能需要專人協助，我們的客服人員會盡快與您聯繫！'
        ));
      }

      // 如果有建議的快速回覆選項
      if (result.suggestedActions && result.suggestedActions.length > 0) {
        const quickItems = result.suggestedActions.map(action => ({
          label: action.slice(0, 20),
          text: action,
        }));
        // 替換最後一則訊息為帶快速回覆的版本
        const lastMsg = replyMessages.pop();
        replyMessages.push(createQuickReply(lastMsg.text, quickItems));
      }
    } else {
      // 錯誤回覆
      replyMessages.push(createTextMessage(
        '抱歉，系統暫時無法處理您的請求，請稍後再試或聯繫客服人員。'
      ));
    }

    // 發送回覆
    const sendResult = await replyMessage(replyToken, replyMessages);

    return {
      success: sendResult.success,
      intent: result.intent,
      processingTime: result.processingTime,
    };
  } catch (error) {
    console.error('❌ 處理 LINE 事件錯誤:', error);

    // 嘗試發送錯誤訊息
    await replyMessage(replyToken, createTextMessage(
      '抱歉，系統發生錯誤，請稍後再試。'
    ));

    return { success: false, error: error.message };
  }
}

/**
 * 處理 LINE Webhook（批次處理多個事件）
 * @param {Array} events - LINE webhook events
 */
export async function handleLineWebhook(events) {
  const results = [];

  for (const event of events) {
    const result = await handleLineEvent(event);
    results.push(result);
  }

  return results;
}

/**
 * 取得用戶資料
 * @param {string} userId - LINE 用戶 ID
 */
export async function getUserProfile(userId) {
  if (!config.line?.channelAccessToken) {
    return null;
  }

  try {
    const response = await fetch(`${LINE_API_BASE}/profile/${userId}`, {
      headers: {
        'Authorization': `Bearer ${config.line.channelAccessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('❌ 取得用戶資料失敗:', error);
    return null;
  }
}

// ==================== 資料庫整合功能 ====================

/**
 * 取得預設區域（用於單區域部署）
 * @returns {Promise<Object|null>} 區域資料
 */
export async function getDefaultRegion() {
  try {
    // 優先查找與當前 LINE Channel 匹配的區域
    if (config.line?.channelId) {
      const region = await prisma.region.findUnique({
        where: { lineChannelId: config.line.channelId },
      });
      if (region) return region;
    }

    // 否則返回第一個活躍區域
    const region = await prisma.region.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    return region;
  } catch (error) {
    console.error('❌ getDefaultRegion 失敗:', error);
    return null;
  }
}


/**
 * 處理 LINE 事件（帶資料庫持久化）
 * 這是主要的訊息處理函數，整合了：
 * - 客戶/對話/訊息的資料庫存儲
 * - 工作時段判斷
 * - 轉人工處理
 * - AI 推薦回覆（已接手對話）
 *
 * @param {Object} event - LINE webhook event
 * @param {Object|string} [regionOrId] - 區域物件或 ID（可選，用於多區域部署）
 * @returns {Object} 處理結果
 */
export async function handleLineEventWithPersistence(event, regionOrId = null) {
  const { type, replyToken, source, message } = event;
  const startTime = Date.now();
  const timing = {};

  // 只處理文字訊息
  if (type !== 'message' || message?.type !== 'text') {
    console.log(`⏭️ 跳過非文字事件: ${type}/${message?.type}`);
    return { success: true, skipped: true };
  }

  const userId = source?.userId;
  const userMessage = message.text;

  console.log(`📩 收到 LINE 訊息 [${userId}]: ${userMessage}`);

  try {
    // 1. 確定區域
    let t1 = Date.now();
    let region;
    if (regionOrId && typeof regionOrId === 'object') {
      // 直接傳入區域物件（多渠道模式）
      region = regionOrId;
    } else if (regionOrId) {
      // 傳入區域 ID
      region = await prisma.region.findUnique({ where: { id: regionOrId } });
    } else {
      // 使用預設區域
      region = await getDefaultRegion();
    }
    timing.region = Date.now() - t1;

    if (!region) {
      console.error('❌ 找不到區域設定');
      await replyMessage(replyToken, createTextMessage(
        '抱歉，系統設定錯誤，請聯繫客服人員。'
      ));
      return { success: false, error: 'Region not found' };
    }

    // 2. 取得用戶資料（使用區域的 token）
    t1 = Date.now();
    const profile = await getUserProfileWithRegion(userId, region);
    timing.profile = Date.now() - t1;

    // 3. 建立/更新客戶記錄
    t1 = Date.now();
    const customer = await getOrCreateCustomer(
      region.id,
      'LINE',
      userId,
      profile || { displayName: userId }
    );
    timing.customer = Date.now() - t1;

    // 4. 取得/建立對話
    t1 = Date.now();
    const { conversation, isNew } = await getOrCreateConversation(
      customer.id,
      region.id,
      'LINE',
      userId
    );
    timing.conversation = Date.now() - t1;

    // 5. 儲存用戶訊息
    t1 = Date.now();
    await saveMessage(conversation.id, 'CUSTOMER', userMessage, {
      metadata: { lineMessageId: message.id },
    });
    timing.saveUserMsg = Date.now() - t1;

    // 6. 檢查對話狀態
    if (conversation.status === 'ASSIGNED') {
      // 已有客服處理，不進行 AI 自動回覆
      // 但異步生成推薦回覆供客服參考（不阻塞主流程）
      const latestMessage = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          senderType: 'CUSTOMER',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (latestMessage) {
        // 異步生成推薦回覆，不等待結果
        generateAndSaveSuggestedReply(latestMessage.id, conversation.id)
          .then(() => console.log(`💡 已為對話 ${conversation.id} 生成推薦回覆`))
          .catch(err => console.error('❌ 生成推薦回覆失敗:', err));
      }

      console.log(`💬 對話已由客服處理，訊息已記錄`);
      return { success: true, handledByAgent: true };
    }

    // 7. AI 處理訊息
    t1 = Date.now();
    const result = await handleMessage(userMessage, conversation.id, userId);
    timing.aiProcessing = Date.now() - t1;

    // 8. 判斷是否需要轉人工
    let replyMessages = [];
    let handoffPerformed = false;

    if (result.requiresHuman) {
      // 檢查工作時段
      t1 = Date.now();
      const withinWorkingHours = await isWithinWorkingHours(region.id);
      timing.workingHours = Date.now() - t1;

      if (withinWorkingHours) {
        // 工作時間內：轉人工佇列
        const priority = getPriorityByVipLevel(customer.vipLevel || 0);
        await handoffToHuman(conversation.id, result.intent || 'USER_REQUEST', { priority });
        handoffPerformed = true;

        // 發送 AI 回覆 + 轉人工提示
        replyMessages.push(createTextMessage(result.reply));
        replyMessages.push(createTextMessage(
          '💡 您的問題需要專人協助，已為您轉接客服人員，請稍候。'
        ));
      } else {
        // 非工作時間：標記待處理，發送統一回覆
        await markOffHoursPending(conversation.id);

        const offHoursMsg = await getOffHoursMessage(region.id);
        replyMessages.push(createTextMessage(offHoursMsg));
      }
    } else {
      // 不需要轉人工：正常 AI 回覆
      replyMessages.push(createTextMessage(result.reply));

      // 如果有快速回覆選項
      if (result.suggestedActions && result.suggestedActions.length > 0) {
        const quickItems = result.suggestedActions.map(action => ({
          label: action.slice(0, 20),
          text: action,
        }));
        const lastMsg = replyMessages.pop();
        replyMessages.push(createQuickReply(lastMsg.text, quickItems));
      }
    }

    // 9. 儲存 BOT 回覆
    t1 = Date.now();
    const botReplyText = replyMessages.map(m => m.text || m.altText).join('\n');
    await saveMessage(conversation.id, 'BOT', botReplyText, {
      metadata: {
        intent: result.intent,
        confidence: result.confidence,
        requiresHuman: result.requiresHuman,
        handoffPerformed,
      },
    });
    timing.saveBotMsg = Date.now() - t1;

    // 10. 發送回覆到 LINE（使用區域的 token）
    t1 = Date.now();
    const sendResult = await replyMessageWithRegion(replyToken, replyMessages, region);
    timing.lineReply = Date.now() - t1;

    // 記錄總耗時
    const totalTime = Date.now() - startTime;
    console.log(`⏱️ 處理耗時: 總計 ${totalTime}ms | 區域:${timing.region}ms 用戶資料:${timing.profile}ms 客戶:${timing.customer}ms 對話:${timing.conversation}ms 存訊息:${timing.saveUserMsg}ms AI:${timing.aiProcessing}ms 存回覆:${timing.saveBotMsg}ms LINE回覆:${timing.lineReply}ms`);

    return {
      success: sendResult.success,
      conversationId: conversation.id,
      customerId: customer.id,
      intent: result.intent,
      requiresHuman: result.requiresHuman,
      handoffPerformed,
      processingTime: totalTime,
      timing,
    };
  } catch (error) {
    console.error('❌ handleLineEventWithPersistence 錯誤:', error);

    // 嘗試發送錯誤訊息（這裡無法確定區域，使用全域配置）
    await replyMessage(replyToken, createTextMessage(
      '抱歉，系統發生錯誤，請稍後再試。'
    ));

    return { success: false, error: error.message };
  }
}

/**
 * 處理 LINE Webhook（批次處理，帶資料庫持久化）
 * @param {Array} events - LINE webhook events
 * @param {string} [regionId] - 區域 ID（可選）
 */
export async function handleLineWebhookWithPersistence(events, regionId = null) {
  const results = [];

  for (const event of events) {
    const result = await handleLineEventWithPersistence(event, regionId);
    results.push(result);
  }

  return results;
}

export default {
  verifySignature,
  replyMessage,
  pushMessage,
  createTextMessage,
  createQuickReply,
  createConfirmTemplate,
  handleLineEvent,
  handleLineWebhook,
  getUserProfile,
  // 新增的持久化功能
  getDefaultRegion,
  handleLineEventWithPersistence,
  handleLineWebhookWithPersistence,
  // 多渠道支援
  verifySignatureMultiChannel,
  replyMessageWithRegion,
  pushMessageWithRegion,
  getUserProfileWithRegion,
};
