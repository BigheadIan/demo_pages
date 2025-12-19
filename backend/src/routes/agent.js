/**
 * 客服工作台 API 路由
 * 金龍永盛客服管理後台
 *
 * 提供客服工作台所需的 API，包括：
 * - 對話佇列管理
 * - 對話接聽/轉接
 * - 客服回覆（推送到 LINE）
 * - 對話結束
 */

import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { ROLES } from '../middleware/rbac.js';
import { pushMessage, pushMessageWithRegion, createTextMessage, createImageMessage } from '../lineHandler.js';
import { saveMessage } from '../services/conversationService.js';
import { getLatestSuggestedReply } from '../services/aiSuggestionService.js';

const router = Router();

/**
 * PUT /api/agent/status
 * 更新客服在線狀態
 */
router.put('/status', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.user;
    const { status } = req.body;

    if (!['ONLINE', 'AWAY', 'OFFLINE'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: '無效的狀態值，必須是 ONLINE, AWAY, 或 OFFLINE',
      });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { onlineStatus: status },
      select: {
        id: true,
        name: true,
        onlineStatus: true,
      },
    });

    res.json({
      success: true,
      message: '狀態已更新',
      data: updated,
    });
  } catch (error) {
    console.error('❌ 更新客服狀態失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/agent/welcome-signature
 * 取得客服的歡迎簽名設定
 */
router.get('/welcome-signature', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.user;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        welcomeSignature: true,
      },
    });

    // 如果沒有設定，返回預設值
    const defaultSignature = `您好我是客服${user.name}，很高興有機會為您服務！`;

    res.json({
      success: true,
      data: {
        welcomeSignature: user.welcomeSignature || defaultSignature,
        isDefault: !user.welcomeSignature,
      },
    });
  } catch (error) {
    console.error('❌ 取得歡迎簽名失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * PUT /api/agent/welcome-signature
 * 更新客服的歡迎簽名
 */
router.put('/welcome-signature', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.user;
    const { welcomeSignature } = req.body;

    if (typeof welcomeSignature !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: '歡迎簽名必須是字串',
      });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { welcomeSignature: welcomeSignature.trim() || null },
      select: {
        id: true,
        name: true,
        welcomeSignature: true,
      },
    });

    res.json({
      success: true,
      message: '歡迎簽名已更新',
      data: updated,
    });
  } catch (error) {
    console.error('❌ 更新歡迎簽名失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/agent/queue
 * 取得等待佇列（等待人工接聽的對話）
 */
router.get('/queue', authMiddleware, async (req, res) => {
  try {
    const { role, regionId } = req.user;

    // 根據角色過濾區域
    let where = {
      status: 'WAITING',
    };

    if (role !== ROLES.SUPER_ADMIN) {
      where.regionId = regionId;
    }

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            pictureUrl: true,
            source: true,
            vipLevel: true,
            crmCustomer: {
              select: {
                id: true,
                name: true,
                company: true,
                customerCode: true,
              },
            },
          },
        },
        region: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            content: true,
            createdAt: true,
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    // 格式化回應
    const queue = conversations.map(conv => ({
      id: conv.id,
      customer: conv.customer,
      region: conv.region,
      priority: conv.priority,
      waitingSince: conv.botHandoffAt || conv.createdAt,
      botHandoffReason: conv.botHandoffReason,
      lastMessage: conv.messages[0] || null,
      messageCount: conv.messageCount,
    }));

    res.json({
      success: true,
      data: queue,
      count: queue.length,
    });
  } catch (error) {
    console.error('❌ 取得等待佇列失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * POST /api/agent/accept/:conversationId
 * 接收對話（從佇列中接聽）
 * 自動發送客服歡迎簽名給客戶
 */
router.post('/accept/:conversationId', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId, regionId, role } = req.user;

    // 檢查客服是否在線，同時取得歡迎簽名
    const agent = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        onlineStatus: true,
        welcomeSignature: true,
      },
    });

    if (agent.onlineStatus !== 'ONLINE') {
      return res.status(400).json({
        success: false,
        error: 'AgentOffline',
        message: '請先將狀態設為上線',
      });
    }

    // 取得對話（含區域資訊用於多渠道 LINE 回覆）
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: {
          select: {
            id: true,
            sourceUserId: true,
            source: true,
          },
        },
        region: {
          select: {
            id: true,
            name: true,
            lineChannelAccessToken: true,
          },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: '對話不存在',
      });
    }

    // 檢查區域權限
    if (role !== ROLES.SUPER_ADMIN && conversation.regionId !== regionId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '無權接聽此區域的對話',
      });
    }

    // 檢查狀態
    if (conversation.status !== 'WAITING') {
      return res.status(400).json({
        success: false,
        error: 'InvalidStatus',
        message: '此對話不在等待狀態',
        currentStatus: conversation.status,
      });
    }

    // 指派給客服
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: 'ASSIGNED',
        assignedAgentId: userId,
      },
      include: {
        customer: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            source: true,
            pictureUrl: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
      },
    });

    // 自動發送歡迎簽名
    const welcomeMessage = agent.welcomeSignature || `您好我是客服${agent.name}，很高興有機會為您服務！`;
    let welcomePushResult = { success: false, skipped: true };

    if (conversation.customer.source === 'LINE') {
      const lineMessage = createTextMessage(welcomeMessage);

      // 使用區域的 LINE Token 發送訊息
      if (conversation.region?.lineChannelAccessToken) {
        welcomePushResult = await pushMessageWithRegion(
          conversation.customer.sourceUserId,
          lineMessage,
          conversation.region
        );
      } else {
        welcomePushResult = await pushMessage(conversation.customer.sourceUserId, lineMessage);
      }

      // 儲存歡迎訊息到資料庫
      if (welcomePushResult.success) {
        await saveMessage(conversationId, 'AGENT', welcomeMessage, {
          senderId: userId,
          metadata: { source: 'WELCOME_SIGNATURE', autoSent: true },
        });
      }
    }

    res.json({
      success: true,
      message: '已接聽對話',
      data: updated,
      welcomeSent: welcomePushResult.success,
    });
  } catch (error) {
    console.error('❌ 接聽對話失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/agent/active
 * 取得當前處理中的對話
 */
router.get('/active', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.user;

    const conversations = await prisma.conversation.findMany({
      where: {
        assignedAgentId: userId,
        status: 'ASSIGNED',
      },
      include: {
        customer: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            pictureUrl: true,
            source: true,
            vipLevel: true,
            crmCustomer: {
              select: {
                id: true,
                name: true,
                company: true,
                customerCode: true,
              },
            },
          },
        },
        region: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            content: true,
            createdAt: true,
            senderType: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    res.json({
      success: true,
      data: conversations,
      count: conversations.length,
    });
  } catch (error) {
    console.error('❌ 取得處理中對話失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * POST /api/agent/transfer/:conversationId
 * 轉接對話給其他客服
 */
router.post('/transfer/:conversationId', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { targetAgentId, reason } = req.body;
    const { userId, regionId, role } = req.user;

    if (!targetAgentId) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: '請指定目標客服',
      });
    }

    // 取得對話
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: '對話不存在',
      });
    }

    // 檢查是否為目前負責的客服
    if (conversation.assignedAgentId !== userId && role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '您不是此對話的負責客服',
      });
    }

    // 檢查目標客服
    const targetAgent = await prisma.user.findUnique({
      where: { id: targetAgentId },
      select: {
        id: true,
        name: true,
        regionId: true,
        onlineStatus: true,
        role: true,
      },
    });

    if (!targetAgent) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: '目標客服不存在',
      });
    }

    if (targetAgent.onlineStatus !== 'ONLINE') {
      return res.status(400).json({
        success: false,
        error: 'AgentOffline',
        message: '目標客服不在線',
      });
    }

    // 區域限制（非 SUPER_ADMIN 只能轉給同區域）
    if (role !== ROLES.SUPER_ADMIN && targetAgent.regionId !== regionId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '只能轉接給同區域的客服',
      });
    }

    // 執行轉接
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        assignedAgentId: targetAgentId,
      },
    });

    // 記錄轉接訊息
    await prisma.message.create({
      data: {
        conversationId,
        senderType: 'BOT',
        contentType: 'TEXT',
        content: `對話已轉接給 ${targetAgent.name}${reason ? `（原因：${reason}）` : ''}`,
        metadata: {
          type: 'TRANSFER',
          fromAgentId: userId,
          toAgentId: targetAgentId,
          reason,
        },
      },
    });

    res.json({
      success: true,
      message: `對話已轉接給 ${targetAgent.name}`,
      data: {
        conversationId,
        newAgentId: targetAgentId,
        newAgentName: targetAgent.name,
      },
    });
  } catch (error) {
    console.error('❌ 轉接對話失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/agent/online
 * 取得在線客服列表
 */
router.get('/online', authMiddleware, async (req, res) => {
  try {
    const { role, regionId } = req.user;

    let where = {
      onlineStatus: 'ONLINE',
      status: 'ACTIVE',
      role: { in: ['AGENT', 'REGION_ADMIN'] },
    };

    if (role !== ROLES.SUPER_ADMIN) {
      where.regionId = regionId;
    }

    const agents = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        regionId: true,
        region: {
          select: { name: true, code: true },
        },
        _count: {
          select: {
            assignedConversations: {
              where: { status: 'ASSIGNED' },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      data: agents.map(agent => ({
        ...agent,
        activeConversations: agent._count.assignedConversations,
      })),
      count: agents.length,
    });
  } catch (error) {
    console.error('❌ 取得在線客服失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

// ==================== 新增的端點 ====================

/**
 * POST /api/agent/reply/:conversationId
 * 客服回覆訊息（推送到 LINE）
 */
router.post('/reply/:conversationId', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, contentType = 'TEXT', fileUrl, fileName } = req.body;
    const { userId, role, regionId } = req.user;

    // 驗證：文字訊息必須有內容，圖片/文件必須有 fileUrl
    if (contentType === 'TEXT' && (!content || content.trim() === '')) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: '訊息內容不能為空',
      });
    }

    if ((contentType === 'IMAGE' || contentType === 'FILE') && !fileUrl) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: '圖片或文件必須提供 fileUrl',
      });
    }

    // 取得對話資訊（包含區域設定，用於多渠道 LINE 回覆）
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: {
          select: {
            id: true,
            sourceUserId: true,
            source: true,
            displayName: true,
          },
        },
        region: {
          select: {
            id: true,
            name: true,
            lineChannelAccessToken: true,
          },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: '對話不存在',
      });
    }

    // 檢查是否為負責客服或管理員
    if (conversation.assignedAgentId !== userId && role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '您不是此對話的負責客服',
      });
    }

    // 檢查對話狀態
    if (conversation.status !== 'ASSIGNED') {
      return res.status(400).json({
        success: false,
        error: 'InvalidStatus',
        message: '對話狀態不正確，無法回覆',
        currentStatus: conversation.status,
      });
    }

    // 儲存訊息到資料庫
    const messageContent = contentType === 'TEXT' ? content.trim() : (fileName || fileUrl);
    const message = await saveMessage(conversationId, 'AGENT', messageContent, {
      senderId: userId,
      contentType,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      metadata: { source: 'AGENT_WORKBENCH' },
    });

    // 根據來源推送訊息
    let pushResult = { success: false, error: 'Unknown source' };

    if (conversation.customer.source === 'LINE') {
      // 根據內容類型選擇訊息格式
      let lineMessage;
      if (contentType === 'IMAGE') {
        lineMessage = createImageMessage(fileUrl);
      } else if (contentType === 'FILE') {
        // LINE 不支援直接發送文件，改為發送文字連結
        lineMessage = createTextMessage(`📎 檔案: ${fileName || '附件'}\n${fileUrl}`);
      } else {
        lineMessage = createTextMessage(content.trim());
      }
      // 使用區域的 LINE Token 發送訊息（支援多渠道）
      if (conversation.region?.lineChannelAccessToken) {
        pushResult = await pushMessageWithRegion(
          conversation.customer.sourceUserId,
          lineMessage,
          conversation.region
        );
      } else {
        // 降級使用全域配置
        pushResult = await pushMessage(conversation.customer.sourceUserId, lineMessage);
      }
    } else {
      // TODO: 支援其他來源（FB, WEB）
      pushResult = { success: false, error: `${conversation.customer.source} 尚未支援推送` };
    }

    // 更新對話的最後訊息時間
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    res.json({
      success: true,
      message: '訊息已發送',
      data: {
        messageId: message.id,
        pushResult,
      },
    });
  } catch (error) {
    console.error('❌ 客服回覆失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * POST /api/agent/close/:conversationId
 * 結束對話
 */
router.post('/close/:conversationId', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { summary } = req.body; // 可選的對話摘要
    const { userId, role } = req.user;

    // 取得對話
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: {
          select: {
            id: true,
            sourceUserId: true,
            source: true,
          },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: '對話不存在',
      });
    }

    // 檢查是否為負責客服或管理員
    if (conversation.assignedAgentId !== userId && role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '您不是此對話的負責客服',
      });
    }

    // 檢查對話狀態
    if (conversation.status === 'CLOSED') {
      return res.status(400).json({
        success: false,
        error: 'InvalidStatus',
        message: '對話已結束',
      });
    }

    // 結束對話
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });

    // 記錄結束訊息
    await prisma.message.create({
      data: {
        conversationId,
        senderType: 'BOT',
        contentType: 'TEXT',
        content: `對話已結束${summary ? `（摘要：${summary}）` : ''}`,
        metadata: {
          type: 'CLOSE',
          closedBy: userId,
          summary,
        },
      },
    });

    // 更新客戶最後聯繫時間
    await prisma.customer.update({
      where: { id: conversation.customer.id },
      data: { lastContactAt: new Date() },
    });

    res.json({
      success: true,
      message: '對話已結束',
      data: {
        conversationId,
        closedAt: updated.closedAt,
      },
    });
  } catch (error) {
    console.error('❌ 結束對話失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/agent/conversation/:conversationId/messages
 * 取得對話訊息列表（分頁）
 */
router.get('/conversation/:conversationId/messages', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const { userId, role, regionId } = req.user;

    // 取得對話
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        regionId: true,
        assignedAgentId: true,
        status: true,
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: '對話不存在',
      });
    }

    // 區域權限檢查
    if (role !== ROLES.SUPER_ADMIN && conversation.regionId !== regionId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '無權查看此區域的對話',
      });
    }

    // 取得訊息
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      include: {
        senderAgent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // 取得總數
    const total = await prisma.message.count({
      where: { conversationId },
    });

    res.json({
      success: true,
      data: messages,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + messages.length < total,
      },
    });
  } catch (error) {
    console.error('❌ 取得對話訊息失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/agent/conversation/:conversationId/suggested-reply
 * 取得最新訊息的 AI 推薦回覆
 *
 * 如果已有快取的推薦回覆則直接返回，否則即時生成
 */
router.get('/conversation/:conversationId/suggested-reply', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { regenerate } = req.query; // ?regenerate=true 強制重新生成
    const { userId, role, regionId } = req.user;

    // 取得對話
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        regionId: true,
        assignedAgentId: true,
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: '對話不存在',
      });
    }

    // 區域權限檢查
    if (role !== ROLES.SUPER_ADMIN && conversation.regionId !== regionId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '無權查看此區域的對話',
      });
    }

    // 使用 AI 推薦服務取得或生成推薦回覆
    const result = await getLatestSuggestedReply(conversationId);

    if (!result.success) {
      return res.json({
        success: true,
        data: null,
        message: result.error,
      });
    }

    res.json({
      success: true,
      data: {
        messageId: result.messageId,
        customerMessage: result.customerMessage,
        suggestedReply: result.suggestedReply,
        generatedAt: result.generatedAt,
        matchedFAQs: result.matchedFAQs || [],
        cached: result.cached,
      },
    });
  } catch (error) {
    console.error('❌ 取得推薦回覆失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

export default router;
