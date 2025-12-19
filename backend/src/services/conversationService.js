/**
 * 對話管理服務
 * 金龍永盛客服管理後台
 *
 * 處理 Customer、Conversation、Message 的建立與管理
 */

import { prisma } from '../db.js';

/**
 * 取得或建立客戶記錄
 * @param {string} regionId - 區域 ID
 * @param {string} source - 來源 (LINE | FB | WEB)
 * @param {string} sourceUserId - 來源用戶 ID
 * @param {Object} profile - 用戶資料
 * @param {string} profile.displayName - 顯示名稱
 * @param {string} [profile.pictureUrl] - 頭像 URL
 * @returns {Promise<Object>} 客戶記錄
 */
export async function getOrCreateCustomer(regionId, source, sourceUserId, profile = {}) {
  try {
    // 嘗試查找現有客戶
    let customer = await prisma.customer.findUnique({
      where: {
        regionId_source_sourceUserId: {
          regionId,
          source,
          sourceUserId,
        },
      },
    });

    if (customer) {
      // 更新客戶資料（如果有變更）
      const updates = {};
      if (profile.displayName && profile.displayName !== customer.displayName) {
        updates.displayName = profile.displayName;
      }
      if (profile.pictureUrl && profile.pictureUrl !== customer.avatarUrl) {
        updates.avatarUrl = profile.pictureUrl;
      }

      if (Object.keys(updates).length > 0) {
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: updates,
        });
      }

      return customer;
    }

    // 建立新客戶
    customer = await prisma.customer.create({
      data: {
        regionId,
        source,
        sourceUserId,
        displayName: profile.displayName || sourceUserId,
        avatarUrl: profile.pictureUrl || null,
      },
    });

    console.log(`👤 建立新客戶: ${customer.displayName} (${source})`);
    return customer;
  } catch (error) {
    console.error('❌ getOrCreateCustomer 失敗:', error);
    throw error;
  }
}

/**
 * 取得或建立對話
 * 查找客戶的活躍對話（非 CLOSED），如果沒有則建立新對話
 * @param {string} customerId - 客戶 ID
 * @param {string} regionId - 區域 ID
 * @param {string} source - 來源
 * @param {string} sourceUserId - 來源用戶 ID
 * @returns {Promise<Object>} { conversation, isNew }
 */
export async function getOrCreateConversation(customerId, regionId, source, sourceUserId) {
  try {
    // 查找活躍對話（非 CLOSED）
    let conversation = await prisma.conversation.findFirst({
      where: {
        customerId,
        status: { not: 'CLOSED' },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (conversation) {
      return { conversation, isNew: false };
    }

    // 建立新對話
    conversation = await prisma.conversation.create({
      data: {
        regionId,
        customerId,
        source,
        sourceUserId,
        status: 'BOT',
        priority: 3,
      },
    });

    // 更新客戶的對話計數
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        totalConversations: { increment: 1 },
        lastContactAt: new Date(),
      },
    });

    console.log(`💬 建立新對話: ${conversation.id}`);
    return { conversation, isNew: true };
  } catch (error) {
    console.error('❌ getOrCreateConversation 失敗:', error);
    throw error;
  }
}

/**
 * 儲存訊息
 * @param {string} conversationId - 對話 ID
 * @param {string} senderType - 發送者類型 (CUSTOMER | BOT | AGENT)
 * @param {string} content - 訊息內容
 * @param {Object} [options] - 選項
 * @param {string} [options.senderId] - 發送者 ID (客服回覆時需要)
 * @param {string} [options.contentType] - 內容類型 (TEXT | IMAGE | FILE | TEMPLATE)
 * @param {Object} [options.metadata] - 元數據
 * @returns {Promise<Object>} 訊息記錄
 */
export async function saveMessage(conversationId, senderType, content, options = {}) {
  const { senderId = null, contentType = 'TEXT', metadata = null, fileUrl = null, fileName = null } = options;

  try {
    // 建立訊息
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderType,
        senderId,
        contentType,
        content,
        fileUrl,
        fileName,
        metadata,
      },
    });

    // 更新對話統計
    const updateData = {
      lastMessageAt: new Date(),
      messageCount: { increment: 1 },
    };

    if (senderType === 'BOT') {
      updateData.botMessageCount = { increment: 1 };
    }

    // 如果有意圖資訊，更新 lastIntent
    if (metadata?.intent) {
      updateData.lastIntent = metadata.intent;
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: updateData,
    });

    return message;
  } catch (error) {
    console.error('❌ saveMessage 失敗:', error);
    throw error;
  }
}

/**
 * 取得對話（包含客戶資訊）
 * @param {string} conversationId - 對話 ID
 * @returns {Promise<Object|null>} 對話記錄
 */
export async function getConversation(conversationId) {
  try {
    return await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: {
          select: {
            id: true,
            displayName: true,
            name: true,
            avatarUrl: true,
            source: true,
            sourceUserId: true,
            vipLevel: true,
          },
        },
        region: {
          select: {
            id: true,
            name: true,
            code: true,
            settings: true,
          },
        },
        assignedAgent: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  } catch (error) {
    console.error('❌ getConversation 失敗:', error);
    throw error;
  }
}

/**
 * 取得對話訊息（分頁）
 * @param {string} conversationId - 對話 ID
 * @param {Object} [options] - 分頁選項
 * @param {number} [options.limit] - 每頁數量
 * @param {number} [options.offset] - 偏移量
 * @param {string} [options.order] - 排序 (asc | desc)
 * @returns {Promise<Array>} 訊息列表
 */
export async function getMessages(conversationId, options = {}) {
  const { limit = 50, offset = 0, order = 'asc' } = options;

  try {
    return await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: order },
      take: limit,
      skip: offset,
      include: {
        senderAgent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  } catch (error) {
    console.error('❌ getMessages 失敗:', error);
    throw error;
  }
}

/**
 * 取得對話歷史（用於 AI 上下文）
 * @param {string} conversationId - 對話 ID
 * @param {number} [limit] - 最多取幾條
 * @returns {Promise<Array>} 格式化的對話歷史
 */
export async function getConversationHistory(conversationId, limit = 20) {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        senderType: true,
        content: true,
        createdAt: true,
      },
    });

    // 反轉為時間正序，並轉換格式
    return messages.reverse().map(msg => ({
      role: msg.senderType === 'CUSTOMER' ? 'user' : 'assistant',
      content: msg.content,
      timestamp: msg.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('❌ getConversationHistory 失敗:', error);
    throw error;
  }
}

/**
 * 更新客戶最後聯繫時間
 * @param {string} customerId - 客戶 ID
 */
export async function updateCustomerLastContact(customerId) {
  try {
    await prisma.customer.update({
      where: { id: customerId },
      data: { lastContactAt: new Date() },
    });
  } catch (error) {
    console.error('❌ updateCustomerLastContact 失敗:', error);
  }
}

export default {
  getOrCreateCustomer,
  getOrCreateConversation,
  saveMessage,
  getConversation,
  getMessages,
  getConversationHistory,
  updateCustomerLastContact,
};
