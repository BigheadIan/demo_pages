/**
 * 罐頭訊息 API 路由
 *
 * 提供罐頭訊息的 CRUD 操作
 */

import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 所有路由都需要認證
router.use(authMiddleware);

/**
 * 取得罐頭訊息列表
 * GET /api/quick-replies
 *
 * Query params:
 * - category: 按分類篩選
 * - active: 是否只顯示啟用的（預設 true）
 */
router.get('/', async (req, res) => {
  try {
    const { category, active = 'true' } = req.query;
    const user = req.user;

    // 建立查詢條件
    const where = {};

    // 篩選啟用狀態
    if (active === 'true') {
      where.isActive = true;
    }

    // 篩選分類
    if (category) {
      where.category = category;
    }

    // 根據用戶角色篩選區域
    // SUPER_ADMIN 可以看到所有，其他用戶只能看到自己區域或全域的
    if (user.role !== 'SUPER_ADMIN' && user.regionId) {
      where.OR = [
        { regionId: null },  // 全域
        { regionId: user.regionId },  // 自己區域
      ];
    }

    const quickReplies = await prisma.quickReply.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { sortOrder: 'asc' },
        { title: 'asc' },
      ],
      include: {
        region: {
          select: { id: true, name: true, code: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    // 取得所有分類
    const categories = await prisma.quickReply.findMany({
      where: where.OR ? { OR: where.OR } : {},
      select: { category: true },
      distinct: ['category'],
    });

    res.json({
      success: true,
      data: quickReplies,
      categories: categories
        .map(c => c.category)
        .filter(Boolean)
        .sort(),
    });
  } catch (error) {
    console.error('取得罐頭訊息失敗:', error);
    res.status(500).json({
      success: false,
      message: '取得罐頭訊息失敗',
    });
  }
});

/**
 * 取得單一罐頭訊息
 * GET /api/quick-replies/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const quickReply = await prisma.quickReply.findUnique({
      where: { id },
      include: {
        region: {
          select: { id: true, name: true, code: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    if (!quickReply) {
      return res.status(404).json({
        success: false,
        message: '找不到該罐頭訊息',
      });
    }

    res.json({
      success: true,
      data: quickReply,
    });
  } catch (error) {
    console.error('取得罐頭訊息失敗:', error);
    res.status(500).json({
      success: false,
      message: '取得罐頭訊息失敗',
    });
  }
});

/**
 * 新增罐頭訊息
 * POST /api/quick-replies
 */
router.post('/', async (req, res) => {
  try {
    const { title, content, category, shortcut, regionId, sortOrder } = req.body;
    const user = req.user;

    // 驗證必填欄位
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: '標題和內容為必填',
      });
    }

    // 檢查快捷鍵是否重複
    if (shortcut) {
      const existing = await prisma.quickReply.findFirst({
        where: { shortcut, isActive: true },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `快捷鍵 "${shortcut}" 已被使用`,
        });
      }
    }

    // 決定區域 ID
    let finalRegionId = null;
    if (regionId) {
      finalRegionId = regionId;
    } else if (user.role !== 'SUPER_ADMIN' && user.regionId) {
      // 非超級管理員預設使用自己的區域
      finalRegionId = user.regionId;
    }

    const quickReply = await prisma.quickReply.create({
      data: {
        title,
        content,
        category: category || null,
        shortcut: shortcut || null,
        regionId: finalRegionId,
        sortOrder: sortOrder || 0,
        createdById: user.id,
      },
      include: {
        region: {
          select: { id: true, name: true, code: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: quickReply,
      message: '罐頭訊息已新增',
    });
  } catch (error) {
    console.error('新增罐頭訊息失敗:', error);
    res.status(500).json({
      success: false,
      message: '新增罐頭訊息失敗',
    });
  }
});

/**
 * 更新罐頭訊息
 * PUT /api/quick-replies/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category, shortcut, regionId, sortOrder, isActive } = req.body;

    // 檢查是否存在
    const existing = await prisma.quickReply.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: '找不到該罐頭訊息',
      });
    }

    // 檢查快捷鍵是否重複（排除自己）
    if (shortcut) {
      const duplicate = await prisma.quickReply.findFirst({
        where: {
          shortcut,
          isActive: true,
          id: { not: id },
        },
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `快捷鍵 "${shortcut}" 已被使用`,
        });
      }
    }

    const quickReply = await prisma.quickReply.update({
      where: { id },
      data: {
        title: title !== undefined ? title : existing.title,
        content: content !== undefined ? content : existing.content,
        category: category !== undefined ? category : existing.category,
        shortcut: shortcut !== undefined ? shortcut : existing.shortcut,
        regionId: regionId !== undefined ? regionId : existing.regionId,
        sortOrder: sortOrder !== undefined ? sortOrder : existing.sortOrder,
        isActive: isActive !== undefined ? isActive : existing.isActive,
      },
      include: {
        region: {
          select: { id: true, name: true, code: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    res.json({
      success: true,
      data: quickReply,
      message: '罐頭訊息已更新',
    });
  } catch (error) {
    console.error('更新罐頭訊息失敗:', error);
    res.status(500).json({
      success: false,
      message: '更新罐頭訊息失敗',
    });
  }
});

/**
 * 刪除罐頭訊息
 * DELETE /api/quick-replies/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 檢查是否存在
    const existing = await prisma.quickReply.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: '找不到該罐頭訊息',
      });
    }

    await prisma.quickReply.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: '罐頭訊息已刪除',
    });
  } catch (error) {
    console.error('刪除罐頭訊息失敗:', error);
    res.status(500).json({
      success: false,
      message: '刪除罐頭訊息失敗',
    });
  }
});

/**
 * 批量更新排序
 * PUT /api/quick-replies/reorder
 */
router.put('/batch/reorder', async (req, res) => {
  try {
    const { items } = req.body; // [{ id, sortOrder }, ...]

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: '請提供正確的排序資料',
      });
    }

    // 批量更新
    await Promise.all(
      items.map(item =>
        prisma.quickReply.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    res.json({
      success: true,
      message: '排序已更新',
    });
  } catch (error) {
    console.error('更新排序失敗:', error);
    res.status(500).json({
      success: false,
      message: '更新排序失敗',
    });
  }
});

export default router;
