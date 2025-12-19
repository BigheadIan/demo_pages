/**
 * 區域管理 API 路由
 * 金龍永盛客服管理後台
 */

import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole, ROLES } from '../middleware/rbac.js';
import { config } from '../config.js';

const router = Router();

/**
 * GET /api/regions
 * 取得區域列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { role, regionId } = req.user;

    let where = {};

    // 非 SUPER_ADMIN 只能看到自己的區域
    if (role !== ROLES.SUPER_ADMIN) {
      where.id = regionId;
    }

    const regions = await prisma.region.findMany({
      where,
      select: {
        id: true,
        name: true,
        code: true,
        lineChannelId: true,
        settings: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            conversations: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: regions,
    });
  } catch (error) {
    console.error('❌ 取得區域列表失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/regions/:id
 * 取得單一區域詳情
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { role, regionId } = req.user;

    // 權限檢查
    if (role !== ROLES.SUPER_ADMIN && regionId !== id) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '無權訪問此區域',
      });
    }

    const region = await prisma.region.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            conversations: true,
            customers: true,
          },
        },
      },
    });

    if (!region) {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: '區域不存在',
      });
    }

    // 隱藏敏感資訊（非 SUPER_ADMIN）
    if (role !== ROLES.SUPER_ADMIN) {
      delete region.lineChannelSecret;
      delete region.lineChannelAccessToken;
    }

    res.json({
      success: true,
      data: region,
    });
  } catch (error) {
    console.error('❌ 取得區域詳情失敗:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * POST /api/regions
 * 創建區域（僅 SUPER_ADMIN）
 */
router.post(
  '/',
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const {
        name,
        code,
        lineChannelId,
        lineChannelSecret,
        lineChannelAccessToken,
        settings,
      } = req.body;

      // 輸入驗證
      if (!name || !code || !lineChannelId || !lineChannelSecret || !lineChannelAccessToken) {
        return res.status(400).json({
          success: false,
          error: 'ValidationError',
          message: '請提供必要欄位：name, code, lineChannelId, lineChannelSecret, lineChannelAccessToken',
        });
      }

      // 檢查代碼是否重複
      const existingCode = await prisma.region.findUnique({
        where: { code },
      });
      if (existingCode) {
        return res.status(400).json({
          success: false,
          error: 'DuplicateCode',
          message: '區域代碼已存在',
        });
      }

      // 檢查 LINE Channel ID 是否重複
      const existingChannel = await prisma.region.findUnique({
        where: { lineChannelId },
      });
      if (existingChannel) {
        return res.status(400).json({
          success: false,
          error: 'DuplicateChannel',
          message: 'LINE Channel ID 已被使用',
        });
      }

      const region = await prisma.region.create({
        data: {
          name,
          code: code.toUpperCase(),
          lineChannelId,
          lineChannelSecret,
          lineChannelAccessToken,
          settings: settings || {
            workingHours: {
              start: '09:00',
              end: '18:00',
              timezone: 'Asia/Taipei',
              workDays: [1, 2, 3, 4, 5],
            },
            autoReplyEnabled: true,
            humanTransferThreshold: 0.5,
          },
        },
      });

      res.status(201).json({
        success: true,
        message: '區域創建成功',
        data: region,
      });
    } catch (error) {
      console.error('❌ 創建區域失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * PUT /api/regions/:id
 * 更新區域（僅 SUPER_ADMIN）
 */
router.put(
  '/:id',
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, settings, isActive } = req.body;

      const region = await prisma.region.findUnique({
        where: { id },
      });

      if (!region) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '區域不存在',
        });
      }

      const updated = await prisma.region.update({
        where: { id },
        data: {
          name: name || region.name,
          settings: settings || region.settings,
          isActive: isActive !== undefined ? isActive : region.isActive,
        },
      });

      res.json({
        success: true,
        message: '區域更新成功',
        data: updated,
      });
    } catch (error) {
      console.error('❌ 更新區域失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * PUT /api/regions/:id/line
 * 更新區域 LINE 設定（僅 SUPER_ADMIN）
 */
router.put(
  '/:id/line',
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { lineChannelId, lineChannelSecret, lineChannelAccessToken } = req.body;

      const region = await prisma.region.findUnique({
        where: { id },
      });

      if (!region) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '區域不存在',
        });
      }

      const updated = await prisma.region.update({
        where: { id },
        data: {
          lineChannelId: lineChannelId || region.lineChannelId,
          lineChannelSecret: lineChannelSecret || region.lineChannelSecret,
          lineChannelAccessToken: lineChannelAccessToken || region.lineChannelAccessToken,
        },
      });

      res.json({
        success: true,
        message: 'LINE 設定更新成功',
        data: {
          id: updated.id,
          lineChannelId: updated.lineChannelId,
        },
      });
    } catch (error) {
      console.error('❌ 更新 LINE 設定失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * DELETE /api/regions/:id
 * 刪除區域（僅 SUPER_ADMIN）
 */
router.delete(
  '/:id',
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;

      const region = await prisma.region.findUnique({
        where: { id },
        include: {
          _count: {
            select: { users: true, conversations: true },
          },
        },
      });

      if (!region) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '區域不存在',
        });
      }

      // 檢查是否有關聯數據
      if (region._count.users > 0 || region._count.conversations > 0) {
        return res.status(400).json({
          success: false,
          error: 'HasDependencies',
          message: '無法刪除：此區域還有用戶或對話記錄',
          counts: region._count,
        });
      }

      await prisma.region.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: '區域已刪除',
      });
    } catch (error) {
      console.error('❌ 刪除區域失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * GET /api/regions/:id/webhook
 * 取得區域的 Webhook URL
 */
router.get(
  '/:id/webhook',
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;

      const region = await prisma.region.findUnique({
        where: { id },
        select: { id: true, code: true, name: true },
      });

      if (!region) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '區域不存在',
        });
      }

      // 構建 Webhook URL
      const baseUrl = process.env.BASE_URL || `http://localhost:${config.server.port}`;
      const webhookUrl = `${baseUrl}/webhook/line/${region.id}`;

      res.json({
        success: true,
        data: {
          regionId: region.id,
          regionCode: region.code,
          regionName: region.name,
          webhookUrl,
          instruction: '請將此 URL 設定為 LINE Developers Console 中的 Webhook URL',
        },
      });
    } catch (error) {
      console.error('❌ 取得 Webhook URL 失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

export default router;
