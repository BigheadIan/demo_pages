/**
 * 定時任務服務
 * 金龍永盛客服管理後台
 *
 * 處理定時執行的任務，包括：
 * - 將非工作時間的對話在上班時加入佇列
 * - 清理過期的對話
 * - 統計報表生成
 */

import { prisma } from '../db.js';
import { HANDOFF_REASONS } from './humanHandoffService.js';

// 簡易定時任務管理
let scheduledTasks = [];
let isRunning = false;

/**
 * 工作時段配置快取
 */
const workingHoursCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 分鐘

/**
 * 取得區域的工作時段設定（帶快取）
 * @param {string} regionId - 區域 ID
 * @returns {Promise<Object>} 工作時段設定
 */
async function getWorkingHours(regionId) {
  const cached = workingHoursCache.get(regionId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const region = await prisma.region.findUnique({
    where: { id: regionId },
    select: { settings: true },
  });

  const workingHours = region?.settings?.workingHours || {
    start: '09:00',
    end: '18:00',
    timezone: 'Asia/Taipei',
    workDays: [1, 2, 3, 4, 5],
  };

  workingHoursCache.set(regionId, {
    data: workingHours,
    timestamp: Date.now(),
  });

  return workingHours;
}

/**
 * 檢查現在是否為工作時間開始時刻
 * @param {Object} workingHours - 工作時段設定
 * @returns {boolean}
 */
function isWorkStartTime(workingHours) {
  const tz = workingHours.timezone || 'Asia/Taipei';
  const now = new Date();

  // 取得當前時區的時間
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const currentTime = timeFormatter.format(now);

  // 取得星期幾 (0=Sunday, 1=Monday, ...)
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  });
  const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .indexOf(dayFormatter.format(now));

  // 檢查是否為工作日
  if (!workingHours.workDays.includes(dayOfWeek)) {
    return false;
  }

  // 檢查是否為開始時間（允許 5 分鐘內的誤差）
  const [startHour, startMinute] = workingHours.start.split(':').map(Number);
  const [currentHour, currentMinute] = currentTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMinute;
  const currentMinutes = currentHour * 60 + currentMinute;

  return currentMinutes >= startMinutes && currentMinutes <= startMinutes + 5;
}

/**
 * 將非工作時間待處理的對話加入佇列
 * @returns {Promise<Object>} 處理結果
 */
export async function processOffHoursPendingConversations() {
  console.log('⏰ 開始處理非工作時間待處理的對話...');

  try {
    // 查找所有標記為 OFF_HOURS_PENDING 且狀態為 BOT 的對話
    const conversations = await prisma.conversation.findMany({
      where: {
        status: 'BOT',
        botHandoffReason: HANDOFF_REASONS.OFF_HOURS_PENDING,
      },
      include: {
        region: {
          select: { id: true, name: true, settings: true },
        },
        customer: {
          select: { vipLevel: true },
        },
      },
    });

    if (conversations.length === 0) {
      console.log('✅ 沒有待處理的非工作時間對話');
      return { processed: 0 };
    }

    let processed = 0;
    let skipped = 0;

    for (const conv of conversations) {
      try {
        // 檢查該區域是否在工作時間
        const workingHours = await getWorkingHours(conv.regionId);

        // 只在工作時間開始時處理（避免重複處理）
        // 或者如果距離標記時間已超過 24 小時，強制處理
        const hoursSinceHandoff = conv.botHandoffAt
          ? (Date.now() - conv.botHandoffAt.getTime()) / (1000 * 60 * 60)
          : 24;

        const shouldProcess = isWorkStartTime(workingHours) || hoursSinceHandoff >= 24;

        if (!shouldProcess) {
          skipped++;
          continue;
        }

        // 計算優先級
        const vipLevel = conv.customer?.vipLevel || 0;
        const priority = vipLevel >= 4 ? 5 : (vipLevel >= 2 ? 4 : 3);

        // 更新對話狀態為 WAITING
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            status: 'WAITING',
            priority,
            botHandoffAt: new Date(), // 重設轉人工時間
          },
        });

        // 新增系統訊息
        await prisma.message.create({
          data: {
            conversationId: conv.id,
            senderType: 'BOT',
            contentType: 'TEXT',
            content: '工作時間已開始，您的問題已加入客服佇列，請稍候。',
            metadata: {
              type: 'SYSTEM',
              action: 'OFF_HOURS_TO_QUEUE',
            },
          },
        });

        processed++;
        console.log(`📋 對話 ${conv.id} 已加入佇列 (區域: ${conv.region?.name})`);
      } catch (err) {
        console.error(`❌ 處理對話 ${conv.id} 失敗:`, err);
      }
    }

    console.log(`✅ 處理完成: ${processed} 個對話已加入佇列, ${skipped} 個跳過`);
    return { processed, skipped, total: conversations.length };
  } catch (error) {
    console.error('❌ processOffHoursPendingConversations 失敗:', error);
    return { error: error.message };
  }
}

/**
 * 清理已關閉且超過保留期限的對話
 * @param {number} [retentionDays=90] - 保留天數
 * @returns {Promise<Object>} 處理結果
 */
export async function cleanupOldConversations(retentionDays = 90) {
  console.log(`🧹 開始清理超過 ${retentionDays} 天的已關閉對話...`);

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // 先刪除訊息
    const deletedMessages = await prisma.message.deleteMany({
      where: {
        conversation: {
          status: 'CLOSED',
          closedAt: { lt: cutoffDate },
        },
      },
    });

    // 再刪除對話
    const deletedConversations = await prisma.conversation.deleteMany({
      where: {
        status: 'CLOSED',
        closedAt: { lt: cutoffDate },
      },
    });

    console.log(`✅ 清理完成: ${deletedConversations.count} 個對話, ${deletedMessages.count} 條訊息`);
    return {
      deletedConversations: deletedConversations.count,
      deletedMessages: deletedMessages.count,
    };
  } catch (error) {
    console.error('❌ cleanupOldConversations 失敗:', error);
    return { error: error.message };
  }
}

/**
 * 更新對話統計（每日任務）
 * @returns {Promise<Object>} 處理結果
 */
export async function updateDailyStats() {
  console.log('📊 開始更新每日統計...');

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 取得每個區域的統計
    const regions = await prisma.region.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const stats = [];

    for (const region of regions) {
      const [
        totalConversations,
        newConversations,
        closedConversations,
        avgResponseTime,
      ] = await Promise.all([
        // 總對話數
        prisma.conversation.count({
          where: { regionId: region.id },
        }),
        // 今日新對話
        prisma.conversation.count({
          where: {
            regionId: region.id,
            createdAt: { gte: today, lt: tomorrow },
          },
        }),
        // 今日結束對話
        prisma.conversation.count({
          where: {
            regionId: region.id,
            closedAt: { gte: today, lt: tomorrow },
          },
        }),
        // 平均首次回應時間（簡化計算）
        prisma.conversation.aggregate({
          where: {
            regionId: region.id,
            status: 'CLOSED',
            closedAt: { gte: today, lt: tomorrow },
          },
          _avg: { messageCount: true },
        }),
      ]);

      stats.push({
        regionId: region.id,
        regionName: region.name,
        totalConversations,
        newConversations,
        closedConversations,
        avgMessageCount: avgResponseTime._avg?.messageCount || 0,
      });
    }

    console.log('✅ 每日統計更新完成');
    return { date: today.toISOString().split('T')[0], stats };
  } catch (error) {
    console.error('❌ updateDailyStats 失敗:', error);
    return { error: error.message };
  }
}

/**
 * 啟動定時任務
 * 使用簡易的 setInterval 實現
 */
export function startScheduledTasks() {
  if (isRunning) {
    console.warn('⚠️ 定時任務已在運行中');
    return;
  }

  isRunning = true;
  console.log('🚀 啟動定時任務服務...');

  // 任務 1: 每 5 分鐘檢查非工作時間待處理的對話
  const offHoursTask = setInterval(async () => {
    try {
      await processOffHoursPendingConversations();
    } catch (err) {
      console.error('❌ 定時任務錯誤 (offHours):', err);
    }
  }, 5 * 60 * 1000); // 5 分鐘
  scheduledTasks.push(offHoursTask);

  // 任務 2: 每天凌晨 3:00 清理舊對話
  const cleanupTask = setInterval(async () => {
    const now = new Date();
    const tz = 'Asia/Taipei';
    const hourFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      hour12: false,
    });
    const hour = parseInt(hourFormatter.format(now));

    if (hour === 3) {
      try {
        await cleanupOldConversations(90);
        await updateDailyStats();
      } catch (err) {
        console.error('❌ 定時任務錯誤 (cleanup):', err);
      }
    }
  }, 60 * 60 * 1000); // 每小時檢查一次
  scheduledTasks.push(cleanupTask);

  console.log('✅ 定時任務服務已啟動');
  console.log('   - 非工作時間對話處理: 每 5 分鐘');
  console.log('   - 舊對話清理: 每天 03:00');
}

/**
 * 停止定時任務
 */
export function stopScheduledTasks() {
  console.log('🛑 停止定時任務服務...');

  for (const task of scheduledTasks) {
    clearInterval(task);
  }
  scheduledTasks = [];
  isRunning = false;

  console.log('✅ 定時任務服務已停止');
}

/**
 * 手動觸發非工作時間對話處理（用於測試）
 */
export async function triggerOffHoursProcessing() {
  return processOffHoursPendingConversations();
}

export default {
  processOffHoursPendingConversations,
  cleanupOldConversations,
  updateDailyStats,
  startScheduledTasks,
  stopScheduledTasks,
  triggerOffHoursProcessing,
};
