/**
 * AI 服務 API 路由
 *
 * 提供 AI 編輯助手等功能
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { rewriteText } from '../gemini.js';

const router = Router();

// 所有路由都需要認證
router.use(authMiddleware);

/**
 * AI 改寫文字
 * POST /api/ai/rewrite
 *
 * Body:
 * - text: 要改寫的文字
 * - mode: 改寫模式 (formal | friendly | concise | expand | correct | custom)
 * - customInstruction: 自訂指令（mode 為 custom 時使用）
 */
router.post('/rewrite', async (req, res) => {
  try {
    const { text, mode = 'correct', customInstruction } = req.body;

    // 驗證必填欄位
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '請提供要改寫的文字',
      });
    }

    // 驗證文字長度
    if (text.length > 2000) {
      return res.status(400).json({
        success: false,
        message: '文字長度不能超過 2000 字',
      });
    }

    // 驗證模式
    const validModes = ['formal', 'friendly', 'concise', 'expand', 'correct', 'custom'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        message: `無效的改寫模式，有效值：${validModes.join(', ')}`,
      });
    }

    // 自訂模式需要提供指令
    if (mode === 'custom' && (!customInstruction || customInstruction.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        message: '自訂模式需要提供指令',
      });
    }

    // 呼叫 AI 改寫
    const result = await rewriteText(text, mode, customInstruction);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || 'AI 改寫失敗',
      });
    }

    res.json({
      success: true,
      data: {
        original: result.original,
        rewritten: result.rewritten,
        mode: result.mode,
        processingTime: result.processingTime,
        tokenUsage: result.tokenUsage,
        estimatedCost: result.estimatedCost,
      },
    });
  } catch (error) {
    console.error('AI 改寫失敗:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'AI 改寫失敗',
    });
  }
});

/**
 * 取得可用的改寫模式
 * GET /api/ai/rewrite-modes
 */
router.get('/rewrite-modes', (req, res) => {
  const modes = [
    { id: 'formal', name: '正式專業', description: '改寫成更正式、專業的語氣，適合商務溝通' },
    { id: 'friendly', name: '親切友善', description: '改寫成更親切、友善的語氣，讓客戶感到溫暖' },
    { id: 'concise', name: '精簡扼要', description: '精簡文字，保留重點，去除冗詞' },
    { id: 'expand', name: '擴展詳述', description: '擴展文字，加入更多細節和說明' },
    { id: 'correct', name: '修正錯誤', description: '修正錯字、文法錯誤，改善可讀性' },
    { id: 'custom', name: '自訂指令', description: '使用自訂的改寫指令' },
  ];

  res.json({
    success: true,
    data: modes,
  });
});

export default router;
