/**
 * 顧客管理 API 路由
 * 金龍永盛客服管理後台
 */

import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole, requireMinimumRole, ROLES } from '../middleware/rbac.js';

const router = Router();

/**
 * GET /api/customers
 * 取得顧客列表
 */
router.get(
  '/',
  authMiddleware,
  async (req, res) => {
    try {
      const { role, regionId: userRegionId } = req.user;
      const {
        page = 1,
        limit = 20,
        search,
        source,
        regionId,
        tagIds,
        vipLevel,
        hasCrmCustomer,
        sortBy = 'lastContactAt',
        sortOrder = 'desc',
      } = req.query;

      // 基本查詢條件
      const where = {};

      // 區域過濾
      if (role !== ROLES.SUPER_ADMIN) {
        where.regionId = userRegionId;
      } else if (regionId) {
        where.regionId = regionId;
      }

      // 搜尋條件
      if (search) {
        where.OR = [
          { displayName: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
          { sourceUserId: { contains: search } },
        ];
      }

      // 來源過濾
      if (source) {
        where.source = source;
      }

      // VIP 等級過濾
      if (vipLevel !== undefined) {
        where.vipLevel = parseInt(vipLevel);
      }

      // CRM 關聯過濾
      if (hasCrmCustomer !== undefined) {
        if (hasCrmCustomer === 'true') {
          where.crmCustomerId = { not: null };
        } else {
          where.crmCustomerId = null;
        }
      }

      // 標籤過濾
      if (tagIds) {
        const tagIdArray = Array.isArray(tagIds) ? tagIds : [tagIds];
        where.customerTags = {
          some: {
            tagId: { in: tagIdArray },
          },
        };
      }

      // 排序
      const orderBy = {};
      orderBy[sortBy] = sortOrder;

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          include: {
            region: {
              select: { id: true, name: true, code: true },
            },
            crmCustomer: {
              select: { id: true, customerCode: true, name: true, company: true },
            },
            customerTags: {
              include: {
                tag: {
                  select: { id: true, name: true, color: true },
                },
              },
            },
            _count: {
              select: { conversations: true },
            },
          },
          orderBy,
          skip: (parseInt(page) - 1) * parseInt(limit),
          take: parseInt(limit),
        }),
        prisma.customer.count({ where }),
      ]);

      // 轉換標籤格式
      const formattedCustomers = customers.map(customer => ({
        ...customer,
        tags: customer.customerTags.map(ct => ct.tag),
        customerTags: undefined,
      }));

      res.json({
        success: true,
        data: formattedCustomers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('❌ 取得顧客列表失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * GET /api/customers/:id
 * 取得顧客詳情
 */
router.get(
  '/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role, regionId: userRegionId } = req.user;

      const customer = await prisma.customer.findUnique({
        where: { id },
        include: {
          region: {
            select: { id: true, name: true, code: true },
          },
          crmCustomer: true,
          customerTags: {
            include: {
              tag: {
                select: { id: true, name: true, color: true, isSystem: true },
              },
            },
          },
          conversations: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              status: true,
              lastIntent: true,
              lastMessageAt: true,
              messageCount: true,
              createdAt: true,
              closedAt: true,
            },
          },
        },
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '顧客不存在',
        });
      }

      // 權限檢查
      if (role !== ROLES.SUPER_ADMIN && customer.regionId !== userRegionId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: '無權訪問此顧客',
        });
      }

      // 格式化標籤
      const formattedCustomer = {
        ...customer,
        tags: customer.customerTags.map(ct => ct.tag),
        customerTags: undefined,
      };

      res.json({
        success: true,
        data: formattedCustomer,
      });
    } catch (error) {
      console.error('❌ 取得顧客詳情失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * PUT /api/customers/:id
 * 更新顧客資料
 */
router.put(
  '/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, phone, company, interests, preferences, notes, vipLevel } = req.body;
      const { role, regionId: userRegionId } = req.user;

      const customer = await prisma.customer.findUnique({
        where: { id },
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '顧客不存在',
        });
      }

      // 權限檢查
      if (role !== ROLES.SUPER_ADMIN && customer.regionId !== userRegionId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: '無權修改此顧客',
        });
      }

      const updated = await prisma.customer.update({
        where: { id },
        data: {
          name: name !== undefined ? name : customer.name,
          email: email !== undefined ? email : customer.email,
          phone: phone !== undefined ? phone : customer.phone,
          company: company !== undefined ? company : customer.company,
          interests: interests !== undefined ? interests : customer.interests,
          preferences: preferences !== undefined ? preferences : customer.preferences,
          notes: notes !== undefined ? notes : customer.notes,
          vipLevel: vipLevel !== undefined ? parseInt(vipLevel) : customer.vipLevel,
        },
        include: {
          region: {
            select: { id: true, name: true, code: true },
          },
          crmCustomer: {
            select: { id: true, customerCode: true, name: true },
          },
          customerTags: {
            include: {
              tag: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
      });

      // 格式化標籤
      const formattedCustomer = {
        ...updated,
        tags: updated.customerTags.map(ct => ct.tag),
        customerTags: undefined,
      };

      res.json({
        success: true,
        message: '顧客資料已更新',
        data: formattedCustomer,
      });
    } catch (error) {
      console.error('❌ 更新顧客資料失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * PUT /api/customers/:id/tags
 * 更新顧客標籤
 */
router.put(
  '/:id/tags',
  authMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { tagIds } = req.body;
      const { role, regionId: userRegionId } = req.user;

      if (!Array.isArray(tagIds)) {
        return res.status(400).json({
          success: false,
          error: 'ValidationError',
          message: '請提供標籤 ID 陣列',
        });
      }

      const customer = await prisma.customer.findUnique({
        where: { id },
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '顧客不存在',
        });
      }

      // 權限檢查
      if (role !== ROLES.SUPER_ADMIN && customer.regionId !== userRegionId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: '無權修改此顧客',
        });
      }

      // 驗證標籤是否存在且有權使用
      if (tagIds.length > 0) {
        const validTags = await prisma.tag.findMany({
          where: {
            id: { in: tagIds },
            isActive: true,
            OR: [
              { regionId: null }, // 全域標籤
              { regionId: customer.regionId }, // 同區域標籤
            ],
          },
        });

        if (validTags.length !== tagIds.length) {
          return res.status(400).json({
            success: false,
            error: 'InvalidTags',
            message: '部分標籤無效或無權使用',
          });
        }
      }

      // 使用事務更新標籤
      await prisma.$transaction([
        // 刪除現有標籤
        prisma.customerTag.deleteMany({
          where: { customerId: id },
        }),
        // 新增標籤
        ...tagIds.map(tagId =>
          prisma.customerTag.create({
            data: {
              customerId: id,
              tagId,
            },
          })
        ),
      ]);

      // 取得更新後的顧客
      const updated = await prisma.customer.findUnique({
        where: { id },
        include: {
          customerTags: {
            include: {
              tag: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
      });

      res.json({
        success: true,
        message: '顧客標籤已更新',
        data: {
          tags: updated.customerTags.map(ct => ct.tag),
        },
      });
    } catch (error) {
      console.error('❌ 更新顧客標籤失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * PUT /api/customers/:id/link-crm
 * 關聯 CRM 客戶
 */
router.put(
  '/:id/link-crm',
  authMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { crmCustomerId, crmCustomerCode } = req.body;
      const { role, regionId: userRegionId } = req.user;

      if (!crmCustomerId && !crmCustomerCode) {
        return res.status(400).json({
          success: false,
          error: 'ValidationError',
          message: '請提供 CRM 客戶 ID 或客戶編號',
        });
      }

      const customer = await prisma.customer.findUnique({
        where: { id },
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '顧客不存在',
        });
      }

      // 權限檢查
      if (role !== ROLES.SUPER_ADMIN && customer.regionId !== userRegionId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: '無權修改此顧客',
        });
      }

      // 查找 CRM 客戶
      let crmCustomer;
      if (crmCustomerId) {
        crmCustomer = await prisma.crmCustomer.findUnique({
          where: { id: crmCustomerId },
        });
      } else {
        crmCustomer = await prisma.crmCustomer.findUnique({
          where: { customerCode: crmCustomerCode },
        });
      }

      if (!crmCustomer) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: 'CRM 客戶不存在',
        });
      }

      // 更新關聯
      const updated = await prisma.customer.update({
        where: { id },
        data: {
          crmCustomerId: crmCustomer.id,
        },
        include: {
          crmCustomer: true,
        },
      });

      res.json({
        success: true,
        message: '已成功關聯 CRM 客戶',
        data: {
          customerId: updated.id,
          crmCustomer: updated.crmCustomer,
        },
      });
    } catch (error) {
      console.error('❌ 關聯 CRM 客戶失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * DELETE /api/customers/:id/unlink-crm
 * 解除 CRM 關聯
 */
router.delete(
  '/:id/unlink-crm',
  authMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role, regionId: userRegionId } = req.user;

      const customer = await prisma.customer.findUnique({
        where: { id },
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '顧客不存在',
        });
      }

      // 權限檢查
      if (role !== ROLES.SUPER_ADMIN && customer.regionId !== userRegionId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: '無權修改此顧客',
        });
      }

      if (!customer.crmCustomerId) {
        return res.status(400).json({
          success: false,
          error: 'InvalidOperation',
          message: '此顧客未關聯 CRM 客戶',
        });
      }

      await prisma.customer.update({
        where: { id },
        data: {
          crmCustomerId: null,
        },
      });

      res.json({
        success: true,
        message: '已解除 CRM 關聯',
      });
    } catch (error) {
      console.error('❌ 解除 CRM 關聯失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * DELETE /api/customers/:id
 * 刪除顧客
 */
router.delete(
  '/:id',
  authMiddleware,
  requireMinimumRole(ROLES.REGION_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role, regionId: userRegionId } = req.user;

      const customer = await prisma.customer.findUnique({
        where: { id },
        include: {
          _count: {
            select: { conversations: true },
          },
        },
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: '顧客不存在',
        });
      }

      // 權限檢查
      if (role === ROLES.REGION_ADMIN && customer.regionId !== userRegionId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: '無權刪除此顧客',
        });
      }

      // 警告有對話記錄
      if (customer._count.conversations > 0) {
        return res.status(400).json({
          success: false,
          error: 'HasDependencies',
          message: `此顧客有 ${customer._count.conversations} 筆對話記錄，無法刪除`,
        });
      }

      // 刪除標籤關聯和顧客
      await prisma.$transaction([
        prisma.customerTag.deleteMany({
          where: { customerId: id },
        }),
        prisma.customer.delete({
          where: { id },
        }),
      ]);

      res.json({
        success: true,
        message: '顧客已刪除',
      });
    } catch (error) {
      console.error('❌ 刪除顧客失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

export default router;
