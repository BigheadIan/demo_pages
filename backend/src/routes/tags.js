/**
 * 標籤管理 API 路由
 * 金龍永盛客服管理後台
 */

import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole, requireMinimumRole, ROLES } from '../middleware/rbac.js';

const router = Router();

/**
 * GET /api/tags
 * 取得標籤列表
 */
router.get(
  '/',
  authMiddleware,
  async (req, res) => {
    try {
      const { role, regionId } = req.user;
      const { includeSystem = 'true', isActive } = req.query;

      // 查詢條件：全域標籤 + 自己區域的標籤
      const where = {
        OR: [
          { regionId: null }, // 全域標籤
        ],
      };

      // 非 SUPER_ADMIN 只能看到自己區域的標籤
      if (role !== ROLES.SUPER_ADMIN) {
        where.OR.push({ regionId });
      } else {
        // SUPER_ADMIN 可以看到所有區域的標籤
        where.OR.push({ regionId: { not: null } });
      }

      // 過濾系統標籤
      if (includeSystem === 'false') {
        where.isSystem = false;
      }

      // 過濾啟用狀態
      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const tags = await prisma.tag.findMany({
        where,
        include: {
          region: {
            select: { id: true, name: true, code: true },
          },
          _count: {
            select: { customers: true },
          },
        },
        orderBy: [
          { isSystem: 'desc' },
          { name: 'asc' },
        ],
      });

      res.json({
        success: true,
        data: tags,
      });
    } catch (error) {
      console.error('❌ 取得標籤列表失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * GET /api/tags/system
 * 取得系統預設標籤
 */
router.get(
  '/system',
  authMiddleware,
  async (req, res) => {
    try {
      const tags = await prisma.tag.findMany({
        where: {
          isSystem: true,
          isActive: true,
        },
        orderBy: { name: 'asc' },
      });

      res.json({
        success: true,
        data: tags,
      });
    } catch (error) {
      console.error('❌ 取得系統標籤失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * POST /api/tags
 * 建立標籤
 */
router.post(
  '/',
  authMiddleware,
  requireMinimumRole(ROLES.REGION_ADMIN),
  async (req, res) => {
    try {
      const { name, color, regionId: targetRegionId, isSystem } = req.body;
      const { role, regionId: userRegionId } = req.user;

      // 輸入驗證
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: 'ValidationError',
          message: '請提供標籤名稱',
        });
      }

      // 決定標籤的區域
      let assignRegionId = targetRegionId;

      // REGION_ADMIN 只能在自己區域建立標籤
      if (role === ROLES.REGION_ADMIN) {
        assignRegionId = userRegionId;
      }

      // 只有 SUPER_ADMIN 可以建立系統標籤或全域標籤
      if (role !== ROLES.SUPER_ADMIN && (isSystem || !assignRegionId)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: '只有超級管理員可以建立系統標籤或全域標籤',
        });
      }

      // 檢查同名標籤
      const existing = await prisma.tag.findFirst({
        where: {
          name: name.trim(),
          regionId: assignRegionId || null,
        },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'DuplicateName',
          message: '此區域已存在同名標籤',
        });
      }

      const tag = await prisma.tag.create({
        data: {
          name: name.trim(),
          color: color || '#6366f1',
          regionId: assignRegionId || null,
          isSystem: role === ROLES.SUPER_ADMIN ? (isSystem || false) : false,
        },
        include: {
          region: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      res.status(201).json({
        success: true,
        message: '標籤建立成功',
        data: tag,
      });
    } catch (error) {
      console.error('❌ 建立標籤失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * PUT /api/tags/:id
 * 更新標籤
 */
router.put(
  '/:id',
  authMiddleware,
  requireMinimumRole(ROLES.REGION_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, color, isActive } = req.body;
      const { role, regionId: userRegionId } = req.user;

      const tag = await prisma.tag.findUnique({
        where: { id },
      });

      if (!tag) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '標籤不存在',
        });
      }

      // 權限檢查
      if (role === ROLES.REGION_ADMIN) {
        // 不能修改系統標籤
        if (tag.isSystem) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: '無法修改系統標籤',
          });
        }
        // 只能修改自己區域的標籤
        if (tag.regionId !== userRegionId) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: '無權修改此標籤',
          });
        }
      }

      // 檢查同名標籤
      if (name && name.trim() !== tag.name) {
        const existing = await prisma.tag.findFirst({
          where: {
            name: name.trim(),
            regionId: tag.regionId,
            id: { not: id },
          },
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            error: 'DuplicateName',
            message: '此區域已存在同名標籤',
          });
        }
      }

      const updated = await prisma.tag.update({
        where: { id },
        data: {
          name: name ? name.trim() : tag.name,
          color: color || tag.color,
          isActive: isActive !== undefined ? isActive : tag.isActive,
        },
        include: {
          region: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      res.json({
        success: true,
        message: '標籤更新成功',
        data: updated,
      });
    } catch (error) {
      console.error('❌ 更新標籤失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * DELETE /api/tags/:id
 * 刪除標籤
 */
router.delete(
  '/:id',
  authMiddleware,
  requireMinimumRole(ROLES.REGION_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role, regionId: userRegionId } = req.user;

      const tag = await prisma.tag.findUnique({
        where: { id },
        include: {
          _count: {
            select: { customers: true },
          },
        },
      });

      if (!tag) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '標籤不存在',
        });
      }

      // 權限檢查
      if (role === ROLES.REGION_ADMIN) {
        if (tag.isSystem) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: '無法刪除系統標籤',
          });
        }
        if (tag.regionId !== userRegionId) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: '無權刪除此標籤',
          });
        }
      }

      // 不能刪除系統標籤（SUPER_ADMIN 也不行）
      if (tag.isSystem) {
        return res.status(400).json({
          success: false,
          error: 'InvalidOperation',
          message: '系統標籤無法刪除，只能停用',
        });
      }

      // 刪除標籤（CustomerTag 會自動級聯刪除）
      await prisma.tag.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: '標籤已刪除',
      });
    } catch (error) {
      console.error('❌ 刪除標籤失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

export default router;
