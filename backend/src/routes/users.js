/**
 * 用戶管理 API 路由
 * 金龍永盛客服管理後台
 */

import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole, requireMinimumRole, ROLES, getRegionFilter } from '../middleware/rbac.js';
import { hashPassword, checkPasswordStrength } from '../utils/password.js';

const router = Router();

/**
 * GET /api/users
 * 取得用戶列表
 */
router.get(
  '/',
  authMiddleware,
  requireMinimumRole(ROLES.REGION_ADMIN),
  async (req, res) => {
    try {
      const { role, regionId } = req.user;
      const { status, onlineStatus, page = 1, limit = 20 } = req.query;

      // 根據角色過濾
      let where = {};
      if (role !== ROLES.SUPER_ADMIN) {
        where.regionId = regionId;
      }

      // 額外過濾條件
      if (status) {
        where.status = status;
      }
      if (onlineStatus) {
        where.onlineStatus = onlineStatus;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            regionId: true,
            region: {
              select: { id: true, name: true, code: true },
            },
            status: true,
            onlineStatus: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: parseInt(limit),
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        success: true,
        data: users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('❌ 取得用戶列表失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * GET /api/users/:id
 * 取得單一用戶詳情
 */
router.get(
  '/:id',
  authMiddleware,
  requireMinimumRole(ROLES.REGION_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role, regionId, userId } = req.user;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          regionId: true,
          region: {
            select: { id: true, name: true, code: true },
          },
          status: true,
          onlineStatus: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { assignedConversations: true },
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '用戶不存在',
        });
      }

      // 權限檢查：REGION_ADMIN 只能看同區域用戶
      if (role === ROLES.REGION_ADMIN && user.regionId !== regionId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: '無權訪問此用戶',
        });
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error('❌ 取得用戶詳情失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * POST /api/users
 * 創建用戶
 */
router.post(
  '/',
  authMiddleware,
  requireMinimumRole(ROLES.REGION_ADMIN),
  async (req, res) => {
    try {
      const { email, password, name, role: newUserRole, regionId: targetRegionId } = req.body;
      const { role: currentRole, regionId: currentRegionId } = req.user;

      // 輸入驗證
      if (!email || !password || !name) {
        return res.status(400).json({
          success: false,
          error: 'ValidationError',
          message: '請提供 email, password, name',
        });
      }

      // 密碼強度檢查
      const strengthCheck = checkPasswordStrength(password);
      if (!strengthCheck.valid) {
        return res.status(400).json({
          success: false,
          error: 'WeakPassword',
          message: strengthCheck.errors.join(', '),
        });
      }

      // 角色限制
      const allowedRole = newUserRole || 'AGENT';

      // REGION_ADMIN 只能創建 AGENT
      if (currentRole === ROLES.REGION_ADMIN) {
        if (allowedRole !== 'AGENT') {
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: '區域管理員只能創建客服人員',
          });
        }
      }

      // 區域限制
      let assignRegionId = targetRegionId;
      if (currentRole === ROLES.REGION_ADMIN) {
        // REGION_ADMIN 只能在自己區域創建用戶
        assignRegionId = currentRegionId;
      }

      // SUPER_ADMIN 必須指定區域（除非創建 SUPER_ADMIN）
      if (currentRole === ROLES.SUPER_ADMIN && allowedRole !== 'SUPER_ADMIN' && !assignRegionId) {
        return res.status(400).json({
          success: false,
          error: 'ValidationError',
          message: '非 SUPER_ADMIN 用戶必須指定區域',
        });
      }

      // 檢查 email 是否重複
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'DuplicateEmail',
          message: 'Email 已被使用',
        });
      }

      // 如果指定區域，檢查區域是否存在
      if (assignRegionId) {
        const region = await prisma.region.findUnique({
          where: { id: assignRegionId },
        });
        if (!region) {
          return res.status(400).json({
            success: false,
            error: 'InvalidRegion',
            message: '指定的區域不存在',
          });
        }
      }

      // 創建用戶
      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name,
          role: allowedRole,
          regionId: assignRegionId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          regionId: true,
          status: true,
          createdAt: true,
        },
      });

      res.status(201).json({
        success: true,
        message: '用戶創建成功',
        data: user,
      });
    } catch (error) {
      console.error('❌ 創建用戶失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * PUT /api/users/:id
 * 更新用戶
 */
router.put(
  '/:id',
  authMiddleware,
  requireMinimumRole(ROLES.REGION_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, role: newRole, regionId: newRegionId, status } = req.body;
      const { role: currentRole, regionId: currentRegionId } = req.user;

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '用戶不存在',
        });
      }

      // 權限檢查
      if (currentRole === ROLES.REGION_ADMIN) {
        // 只能管理同區域用戶
        if (user.regionId !== currentRegionId) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: '無權修改此用戶',
          });
        }
        // 不能修改角色和區域
        if (newRole || newRegionId) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: '區域管理員無法修改用戶角色或區域',
          });
        }
      }

      // 不能修改 SUPER_ADMIN（除非自己是 SUPER_ADMIN）
      if (user.role === ROLES.SUPER_ADMIN && currentRole !== ROLES.SUPER_ADMIN) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: '無權修改超級管理員',
        });
      }

      const updated = await prisma.user.update({
        where: { id },
        data: {
          name: name || user.name,
          role: newRole || user.role,
          regionId: newRegionId !== undefined ? newRegionId : user.regionId,
          status: status || user.status,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          regionId: true,
          status: true,
          updatedAt: true,
        },
      });

      res.json({
        success: true,
        message: '用戶更新成功',
        data: updated,
      });
    } catch (error) {
      console.error('❌ 更新用戶失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * PUT /api/users/:id/status
 * 更新用戶狀態
 */
router.put(
  '/:id/status',
  authMiddleware,
  requireMinimumRole(ROLES.REGION_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const { role: currentRole, regionId: currentRegionId } = req.user;

      if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'ValidationError',
          message: '無效的狀態值',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '用戶不存在',
        });
      }

      // 權限檢查
      if (currentRole === ROLES.REGION_ADMIN && user.regionId !== currentRegionId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: '無權修改此用戶',
        });
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { status },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
        },
      });

      res.json({
        success: true,
        message: '用戶狀態已更新',
        data: updated,
      });
    } catch (error) {
      console.error('❌ 更新用戶狀態失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * DELETE /api/users/:id
 * 刪除用戶
 */
router.delete(
  '/:id',
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      // 不能刪除自己
      if (id === userId) {
        return res.status(400).json({
          success: false,
          error: 'InvalidOperation',
          message: '不能刪除自己的帳號',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          _count: {
            select: { assignedConversations: true },
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '用戶不存在',
        });
      }

      // 檢查是否有進行中的對話
      if (user._count.assignedConversations > 0) {
        return res.status(400).json({
          success: false,
          error: 'HasDependencies',
          message: '此用戶還有指派的對話，請先重新分配',
          count: user._count.assignedConversations,
        });
      }

      // 刪除相關的 Refresh Token
      await prisma.refreshToken.deleteMany({
        where: { userId: id },
      });

      // 刪除用戶
      await prisma.user.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: '用戶已刪除',
      });
    } catch (error) {
      console.error('❌ 刪除用戶失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * PUT /api/users/:id/reset-password
 * 重設用戶密碼（僅 SUPER_ADMIN）
 */
router.put(
  '/:id/reset-password',
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;

      if (!newPassword) {
        return res.status(400).json({
          success: false,
          error: 'ValidationError',
          message: '請提供新密碼',
        });
      }

      // 密碼強度檢查
      const strengthCheck = checkPasswordStrength(newPassword);
      if (!strengthCheck.valid) {
        return res.status(400).json({
          success: false,
          error: 'WeakPassword',
          message: strengthCheck.errors.join(', '),
        });
      }

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '用戶不存在',
        });
      }

      const passwordHash = await hashPassword(newPassword);

      await prisma.user.update({
        where: { id },
        data: { passwordHash },
      });

      // 清除該用戶的所有 Refresh Token
      await prisma.refreshToken.deleteMany({
        where: { userId: id },
      });

      res.json({
        success: true,
        message: '密碼已重設，用戶需要重新登入',
      });
    } catch (error) {
      console.error('❌ 重設密碼失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

export default router;
