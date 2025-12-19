/**
 * 報表 API 路由
 * 金龍永盛客服管理後台
 */

import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { ROLES, getRegionFilter } from '../middleware/rbac.js';

const router = Router();

/**
 * GET /api/reports/overview
 * 總覽報表
 */
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    const { role, regionId } = req.user;
    const { startDate, endDate, regionId: queryRegionId } = req.query;

    // 日期範圍（預設過去 30 天）
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 區域過濾
    let regionFilter = {};
    if (role === ROLES.SUPER_ADMIN && queryRegionId) {
      regionFilter.regionId = queryRegionId;
    } else if (role !== ROLES.SUPER_ADMIN) {
      regionFilter.regionId = regionId;
    }

    // 查詢每日統計
    const dailyStats = await prisma.dailyStats.findMany({
      where: {
        ...regionFilter,
        date: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { date: 'asc' },
    });

    // 匯總數據
    const summary = dailyStats.reduce(
      (acc, day) => ({
        totalConversations: acc.totalConversations + day.totalConversations,
        humanTransfers: acc.humanTransfers + day.humanTransfers,
        totalMessages: acc.totalMessages + day.totalMessages,
        botMessages: acc.botMessages + day.botMessages,
        agentMessages: acc.agentMessages + day.agentMessages,
        resolvedByBot: acc.resolvedByBot + day.resolvedByBot,
      }),
      {
        totalConversations: 0,
        humanTransfers: 0,
        totalMessages: 0,
        botMessages: 0,
        agentMessages: 0,
        resolvedByBot: 0,
      }
    );

    // 計算 AI 解決率
    summary.botResolutionRate =
      summary.totalConversations > 0
        ? (summary.resolvedByBot / summary.totalConversations).toFixed(2)
        : 0;

    // 趨勢數據
    const trend = dailyStats.map(day => ({
      date: day.date.toISOString().split('T')[0],
      conversations: day.totalConversations,
      transfers: day.humanTransfers,
      messages: day.totalMessages,
    }));

    // 意圖分布（合併所有天數）
    const intentBreakdown = dailyStats.reduce((acc, day) => {
      if (day.intentBreakdown) {
        Object.entries(day.intentBreakdown).forEach(([intent, count]) => {
          acc[intent] = (acc[intent] || 0) + count;
        });
      }
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        period: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        },
        summary,
        trend,
        intentBreakdown,
      },
    });
  } catch (error) {
    console.error('❌ 取得總覽報表失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/reports/daily
 * 每日統計
 */
router.get('/daily', authMiddleware, async (req, res) => {
  try {
    const { role, regionId } = req.user;
    const { date, regionId: queryRegionId } = req.query;

    // 日期（預設今天）
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    // 區域過濾
    let regionFilter = {};
    if (role === ROLES.SUPER_ADMIN && queryRegionId) {
      regionFilter.regionId = queryRegionId;
    } else if (role !== ROLES.SUPER_ADMIN) {
      regionFilter.regionId = regionId;
    }

    const stats = await prisma.dailyStats.findFirst({
      where: {
        ...regionFilter,
        date: targetDate,
      },
      include: {
        region: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    // 如果沒有統計數據，返回當天即時統計
    if (!stats) {
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const [conversationCount, messageCount, transferCount] = await Promise.all([
        prisma.conversation.count({
          where: {
            ...regionFilter,
            createdAt: { gte: targetDate, lt: nextDay },
          },
        }),
        prisma.message.count({
          where: {
            conversation: regionFilter,
            createdAt: { gte: targetDate, lt: nextDay },
          },
        }),
        prisma.conversation.count({
          where: {
            ...regionFilter,
            status: { in: ['WAITING', 'ASSIGNED'] },
            botHandoffAt: { gte: targetDate, lt: nextDay },
          },
        }),
      ]);

      return res.json({
        success: true,
        data: {
          date: targetDate.toISOString().split('T')[0],
          totalConversations: conversationCount,
          humanTransfers: transferCount,
          totalMessages: messageCount,
          isRealtime: true,
        },
      });
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('❌ 取得每日統計失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/reports/agents
 * 客服績效報表
 */
router.get('/agents', authMiddleware, async (req, res) => {
  try {
    const { role, regionId } = req.user;
    const { startDate, endDate } = req.query;

    // 日期範圍
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 區域過濾
    let agentFilter = {
      role: { in: ['AGENT', 'REGION_ADMIN'] },
    };
    if (role !== ROLES.SUPER_ADMIN) {
      agentFilter.regionId = regionId;
    }

    // 取得客服列表
    const agents = await prisma.user.findMany({
      where: agentFilter,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        region: {
          select: { name: true, code: true },
        },
      },
    });

    // 統計每個客服的績效
    const performance = await Promise.all(
      agents.map(async agent => {
        const [
          totalConversations,
          closedConversations,
          totalMessages,
        ] = await Promise.all([
          prisma.conversation.count({
            where: {
              assignedAgentId: agent.id,
              createdAt: { gte: start, lte: end },
            },
          }),
          prisma.conversation.count({
            where: {
              assignedAgentId: agent.id,
              status: 'CLOSED',
              closedAt: { gte: start, lte: end },
            },
          }),
          prisma.message.count({
            where: {
              senderId: agent.id,
              senderType: 'AGENT',
              createdAt: { gte: start, lte: end },
            },
          }),
        ]);

        return {
          ...agent,
          stats: {
            totalConversations,
            closedConversations,
            totalMessages,
            avgMessagesPerConversation:
              totalConversations > 0
                ? (totalMessages / totalConversations).toFixed(1)
                : 0,
          },
        };
      })
    );

    // 按處理對話數排序
    performance.sort((a, b) => b.stats.totalConversations - a.stats.totalConversations);

    res.json({
      success: true,
      data: {
        period: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        },
        agents: performance,
      },
    });
  } catch (error) {
    console.error('❌ 取得客服績效失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/reports/conversations
 * 對話統計
 */
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const { role, regionId } = req.user;
    const { startDate, endDate, regionId: queryRegionId } = req.query;

    // 日期範圍
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 區域過濾
    let regionFilter = {};
    if (role === ROLES.SUPER_ADMIN && queryRegionId) {
      regionFilter.regionId = queryRegionId;
    } else if (role !== ROLES.SUPER_ADMIN) {
      regionFilter.regionId = regionId;
    }

    // 各狀態統計
    const [byStatus, bySource, byIntent] = await Promise.all([
      // 按狀態分組
      prisma.conversation.groupBy({
        by: ['status'],
        where: {
          ...regionFilter,
          createdAt: { gte: start, lte: end },
        },
        _count: true,
      }),
      // 按來源分組
      prisma.conversation.groupBy({
        by: ['source'],
        where: {
          ...regionFilter,
          createdAt: { gte: start, lte: end },
        },
        _count: true,
      }),
      // 按最後意圖分組
      prisma.conversation.groupBy({
        by: ['lastIntent'],
        where: {
          ...regionFilter,
          createdAt: { gte: start, lte: end },
          lastIntent: { not: null },
        },
        _count: true,
        orderBy: { _count: { lastIntent: 'desc' } },
        take: 10,
      }),
    ]);

    res.json({
      success: true,
      data: {
        period: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        },
        byStatus: byStatus.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {}),
        bySource: bySource.reduce((acc, item) => {
          acc[item.source] = item._count;
          return acc;
        }, {}),
        topIntents: byIntent.map(item => ({
          intent: item.lastIntent,
          count: item._count,
        })),
      },
    });
  } catch (error) {
    console.error('❌ 取得對話統計失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/reports/realtime
 * 即時統計（今日）
 */
router.get('/realtime', authMiddleware, async (req, res) => {
  try {
    const { role, regionId } = req.user;

    // 今天開始時間
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 區域過濾
    let regionFilter = {};
    if (role !== ROLES.SUPER_ADMIN) {
      regionFilter.regionId = regionId;
    }

    const [
      todayConversations,
      todayMessages,
      waitingCount,
      onlineAgents,
      activeConversations,
    ] = await Promise.all([
      prisma.conversation.count({
        where: {
          ...regionFilter,
          createdAt: { gte: today },
        },
      }),
      prisma.message.count({
        where: {
          conversation: regionFilter,
          createdAt: { gte: today },
        },
      }),
      prisma.conversation.count({
        where: {
          ...regionFilter,
          status: 'WAITING',
        },
      }),
      prisma.user.count({
        where: {
          ...regionFilter,
          onlineStatus: 'ONLINE',
          role: { in: ['AGENT', 'REGION_ADMIN'] },
        },
      }),
      prisma.conversation.count({
        where: {
          ...regionFilter,
          status: 'ASSIGNED',
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        todayConversations,
        todayMessages,
        waitingCount,
        onlineAgents,
        activeConversations,
      },
    });
  } catch (error) {
    console.error('❌ 取得即時統計失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

export default router;
