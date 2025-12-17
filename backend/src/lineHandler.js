/**
 * 金龍永盛 AI 客服系統 - LINE Messaging API 處理模組
 *
 * 處理 LINE Webhook 事件，整合意圖分類和自動回覆
 */
import crypto from 'crypto';
import { config } from './config.js';
import { handleMessage } from './intentRouter.js';
import { faqAutoReply } from './gemini.js';

// LINE API 設定
const LINE_API_BASE = 'https://api.line.me/v2/bot';

/**
 * 驗證 LINE Webhook 簽名
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
};
