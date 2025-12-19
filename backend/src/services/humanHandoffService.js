/**
 * 轉人工服務
 * 金龍永盛客服管理後台
 *
 * 處理對話轉人工客服的邏輯
 */

import { prisma } from '../db.js';

/**
 * 轉人工原因常量
 */
export const HANDOFF_REASONS = {
  USER_REQUEST: 'USER_REQUEST',           // 用戶主動要求
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',       // AI 信心度低
  COMPLEX_QUERY: 'COMPLEX_QUERY',         // 複雜查詢
  SENSITIVE_TOPIC: 'SENSITIVE_TOPIC',     // 敏感話題
  ESCALATION: 'ESCALATION',               // 升級處理
  OFF_HOURS_PENDING: 'OFF_HOURS_PENDING', // 非工作時間待處理
};

/**
 * 將對話轉移到人工客服佇列
 * @param {string} conversationId - 對話 ID
 * @param {string} reason - 轉人工原因
 * @param {Object} [options] - 選項
 * @param {number} [options.priority] - 優先級 (1-5)
 * @returns {Promise<Object>} 更新後的對話
 */
export async function handoffToHuman(conversationId, reason, options = {}) {
  const { priority } = options;

  try {
    const updateData = {
      status: 'WAITING',
      botHandoffReason: reason,
      botHandoffAt: new Date(),
    };

    // 如果指定優先級，更新它
    if (priority !== undefined && priority >= 1 && priority <= 5) {
      updateData.priority = priority;
    }

    const conversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            displayName: true,
            vipLevel: true,
          },
        },
        region: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    console.log(`🔄 對話 ${conversationId} 已轉人工 (原因: ${reason})`);

    // TODO: 未來可以在這裡發送通知給線上客服
    // await notifyOnlineAgents(conversation.regionId, conversation);

    return conversation;
  } catch (error) {
    console.error('❌ handoffToHuman 失敗:', error);
    throw error;
  }
}

/**
 * 標記為非工作時間待處理（不立即進入佇列）
 * @param {string} conversationId - 對話 ID
 * @returns {Promise<Object>} 更新後的對話
 */
export async function markOffHoursPending(conversationId) {
  try {
    const conversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        botHandoffReason: HANDOFF_REASONS.OFF_HOURS_PENDING,
        // 狀態保持 BOT，等待定時任務處理
      },
    });

    console.log(`⏰ 對話 ${conversationId} 標記為非工作時間待處理`);
    return conversation;
  } catch (error) {
    console.error('❌ markOffHoursPending 失敗:', error);
    throw error;
  }
}

/**
 * 取得對話在佇列中的位置
 * @param {string} conversationId - 對話 ID
 * @returns {Promise<number>} 佇列位置 (從 1 開始)
 */
export async function getQueuePosition(conversationId) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        regionId: true,
        priority: true,
        botHandoffAt: true,
        status: true,
      },
    });

    if (!conversation || conversation.status !== 'WAITING') {
      return 0;
    }

    // 計算在佇列中的位置
    // 排序邏輯：優先級 DESC, 轉人工時間 ASC
    const ahead = await prisma.conversation.count({
      where: {
        regionId: conversation.regionId,
        status: 'WAITING',
        OR: [
          { priority: { gt: conversation.priority } },
          {
            priority: conversation.priority,
            botHandoffAt: { lt: conversation.botHandoffAt },
          },
        ],
      },
    });

    return ahead + 1;
  } catch (error) {
    console.error('❌ getQueuePosition 失敗:', error);
    return 0;
  }
}

/**
 * 取得區域的等待佇列統計
 * @param {string} regionId - 區域 ID
 * @returns {Promise<Object>} 佇列統計
 */
export async function getQueueStats(regionId) {
  try {
    const [waiting, avgWaitTime] = await Promise.all([
      // 等待中的對話數
      prisma.conversation.count({
        where: {
          regionId,
          status: 'WAITING',
        },
      }),
      // 平均等待時間
      prisma.conversation.aggregate({
        where: {
          regionId,
          status: 'WAITING',
          botHandoffAt: { not: null },
        },
        _avg: {
          // 這裡無法直接計算等待時間，需要在應用層處理
        },
      }),
    ]);

    // 取得最長等待時間
    const oldestWaiting = await prisma.conversation.findFirst({
      where: {
        regionId,
        status: 'WAITING',
      },
      orderBy: { botHandoffAt: 'asc' },
      select: { botHandoffAt: true },
    });

    let maxWaitMinutes = 0;
    if (oldestWaiting?.botHandoffAt) {
      maxWaitMinutes = Math.floor(
        (Date.now() - oldestWaiting.botHandoffAt.getTime()) / 60000
      );
    }

    return {
      waiting,
      maxWaitMinutes,
    };
  } catch (error) {
    console.error('❌ getQueueStats 失敗:', error);
    return { waiting: 0, maxWaitMinutes: 0 };
  }
}

/**
 * 根據 VIP 等級調整優先級
 * @param {number} vipLevel - VIP 等級 (0-5)
 * @returns {number} 建議優先級 (1-5)
 */
export function getPriorityByVipLevel(vipLevel) {
  // VIP 0-1: 普通優先級 3
  // VIP 2-3: 中等優先級 4
  // VIP 4-5: 高優先級 5
  if (vipLevel >= 4) return 5;
  if (vipLevel >= 2) return 4;
  return 3;
}

/**
 * 通知線上客服有新對話（未來擴展用）
 * @param {string} regionId - 區域 ID
 * @param {Object} conversation - 對話資訊
 */
export async function notifyOnlineAgents(regionId, conversation) {
  // TODO: 實現 WebSocket 或推送通知
  // 目前只記錄日誌
  console.log(`📢 通知區域 ${regionId} 的線上客服：新對話等待中`);
}

export default {
  HANDOFF_REASONS,
  handoffToHuman,
  markOffHoursPending,
  getQueuePosition,
  getQueueStats,
  getPriorityByVipLevel,
  notifyOnlineAgents,
};
