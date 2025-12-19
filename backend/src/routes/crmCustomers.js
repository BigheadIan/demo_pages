/**
 * CRM 客戶管理 API 路由
 * 金龍永盛客服管理後台
 */

import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole, requireMinimumRole, ROLES } from '../middleware/rbac.js';

const router = Router();

/**
 * GET /api/crm-customers
 * 取得 CRM 客戶列表
 */
router.get(
  '/',
  authMiddleware,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      // 查詢條件
      const where = {};

      // 搜尋條件
      if (search) {
        where.OR = [
          { customerCode: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
        ];
      }

      // 排序
      const orderBy = {};
      orderBy[sortBy] = sortOrder;

      const [crmCustomers, total] = await Promise.all([
        prisma.crmCustomer.findMany({
          where,
          include: {
            _count: {
              select: { customers: true },
            },
          },
          orderBy,
          skip: (parseInt(page) - 1) * parseInt(limit),
          take: parseInt(limit),
        }),
        prisma.crmCustomer.count({ where }),
      ]);

      res.json({
        success: true,
        data: crmCustomers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('❌ 取得 CRM 客戶列表失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * GET /api/crm-customers/:id
 * 取得 CRM 客戶詳情
 */
router.get(
  '/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;

      const crmCustomer = await prisma.crmCustomer.findUnique({
        where: { id },
        include: {
          customers: {
            select: {
              id: true,
              displayName: true,
              source: true,
              sourceUserId: true,
              phone: true,
              email: true,
              vipLevel: true,
              lastContactAt: true,
              region: {
                select: { id: true, name: true, code: true },
              },
            },
          },
        },
      });

      if (!crmCustomer) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: 'CRM 客戶不存在',
        });
      }

      res.json({
        success: true,
        data: crmCustomer,
      });
    } catch (error) {
      console.error('❌ 取得 CRM 客戶詳情失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * GET /api/crm-customers/:id/customers
 * 取得關聯的社群帳號列表
 */
router.get(
  '/:id/customers',
  authMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role, regionId: userRegionId } = req.user;

      const crmCustomer = await prisma.crmCustomer.findUnique({
        where: { id },
      });

      if (!crmCustomer) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: 'CRM 客戶不存在',
        });
      }

      // 查詢關聯的顧客（根據權限過濾）
      const where = {
        crmCustomerId: id,
      };

      if (role !== ROLES.SUPER_ADMIN) {
        where.regionId = userRegionId;
      }

      const customers = await prisma.customer.findMany({
        where,
        include: {
          region: {
            select: { id: true, name: true, code: true },
          },
          customerTags: {
            include: {
              tag: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
        orderBy: { lastContactAt: 'desc' },
      });

      // 格式化標籤
      const formattedCustomers = customers.map(customer => ({
        ...customer,
        tags: customer.customerTags.map(ct => ct.tag),
        customerTags: undefined,
      }));

      res.json({
        success: true,
        data: formattedCustomers,
      });
    } catch (error) {
      console.error('❌ 取得關聯社群帳號失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * POST /api/crm-customers
 * 建立 CRM 客戶
 */
router.post(
  '/',
  authMiddleware,
  async (req, res) => {
    try {
      const { customerCode, name, phone, email, address, company, notes, metadata, externalId } = req.body;

      // 輸入驗證
      if (!customerCode || !name) {
        return res.status(400).json({
          success: false,
          error: 'ValidationError',
          message: '請提供客戶編號和姓名',
        });
      }

      // 檢查客戶編號是否重複
      const existing = await prisma.crmCustomer.findUnique({
        where: { customerCode },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'DuplicateCode',
          message: '客戶編號已存在',
        });
      }

      const crmCustomer = await prisma.crmCustomer.create({
        data: {
          customerCode,
          name,
          phone,
          email,
          address,
          company,
          notes,
          metadata,
          externalId,
        },
      });

      res.status(201).json({
        success: true,
        message: 'CRM 客戶建立成功',
        data: crmCustomer,
      });
    } catch (error) {
      console.error('❌ 建立 CRM 客戶失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * PUT /api/crm-customers/:id
 * 更新 CRM 客戶
 */
router.put(
  '/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, phone, email, address, company, notes, metadata } = req.body;

      const crmCustomer = await prisma.crmCustomer.findUnique({
        where: { id },
      });

      if (!crmCustomer) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: 'CRM 客戶不存在',
        });
      }

      const updated = await prisma.crmCustomer.update({
        where: { id },
        data: {
          name: name !== undefined ? name : crmCustomer.name,
          phone: phone !== undefined ? phone : crmCustomer.phone,
          email: email !== undefined ? email : crmCustomer.email,
          address: address !== undefined ? address : crmCustomer.address,
          company: company !== undefined ? company : crmCustomer.company,
          notes: notes !== undefined ? notes : crmCustomer.notes,
          metadata: metadata !== undefined ? metadata : crmCustomer.metadata,
        },
        include: {
          _count: {
            select: { customers: true },
          },
        },
      });

      res.json({
        success: true,
        message: 'CRM 客戶已更新',
        data: updated,
      });
    } catch (error) {
      console.error('❌ 更新 CRM 客戶失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * DELETE /api/crm-customers/:id
 * 刪除 CRM 客戶
 */
router.delete(
  '/:id',
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const { id } = req.params;

      const crmCustomer = await prisma.crmCustomer.findUnique({
        where: { id },
        include: {
          _count: {
            select: { customers: true },
          },
        },
      });

      if (!crmCustomer) {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: 'CRM 客戶不存在',
        });
      }

      // 檢查是否有關聯的顧客
      if (crmCustomer._count.customers > 0) {
        return res.status(400).json({
          success: false,
          error: 'HasDependencies',
          message: `此 CRM 客戶有 ${crmCustomer._count.customers} 個關聯的社群帳號，請先解除關聯`,
        });
      }

      await prisma.crmCustomer.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: 'CRM 客戶已刪除',
      });
    } catch (error) {
      console.error('❌ 刪除 CRM 客戶失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

/**
 * POST /api/crm-customers/sync
 * 批量同步 CRM 客戶資料（從外部系統）
 */
router.post(
  '/sync',
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    try {
      const { customers } = req.body;

      if (!Array.isArray(customers) || customers.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'ValidationError',
          message: '請提供要同步的客戶資料陣列',
        });
      }

      const results = {
        created: 0,
        updated: 0,
        errors: [],
      };

      for (const customer of customers) {
        try {
          if (!customer.customerCode || !customer.name) {
            results.errors.push({
              customerCode: customer.customerCode,
              error: '缺少必要欄位（customerCode, name）',
            });
            continue;
          }

          const existing = await prisma.crmCustomer.findUnique({
            where: { customerCode: customer.customerCode },
          });

          if (existing) {
            // 更新現有客戶
            await prisma.crmCustomer.update({
              where: { customerCode: customer.customerCode },
              data: {
                name: customer.name,
                phone: customer.phone,
                email: customer.email,
                address: customer.address,
                company: customer.company,
                notes: customer.notes,
                metadata: customer.metadata,
                externalId: customer.externalId,
                lastSyncAt: new Date(),
              },
            });
            results.updated++;
          } else {
            // 建立新客戶
            await prisma.crmCustomer.create({
              data: {
                customerCode: customer.customerCode,
                name: customer.name,
                phone: customer.phone,
                email: customer.email,
                address: customer.address,
                company: customer.company,
                notes: customer.notes,
                metadata: customer.metadata,
                externalId: customer.externalId,
                lastSyncAt: new Date(),
              },
            });
            results.created++;
          }
        } catch (err) {
          results.errors.push({
            customerCode: customer.customerCode,
            error: err.message,
          });
        }
      }

      res.json({
        success: true,
        message: `同步完成：新增 ${results.created} 筆，更新 ${results.updated} 筆，錯誤 ${results.errors.length} 筆`,
        data: results,
      });
    } catch (error) {
      console.error('❌ 同步 CRM 客戶失敗:', error);
      res.status(500).json({
        success: false,
        error: 'ServerError',
        message: '伺服器錯誤',
      });
    }
  }
);

export default router;
