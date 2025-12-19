/**
 * 認證 API 路由
 * 金龍永盛客服管理後台
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { checkPasswordStrength } from '../utils/password.js';
import {
  login,
  logout,
  refreshAccessToken,
  getCurrentUser,
  changePassword,
} from '../services/authService.js';

const router = Router();

/**
 * POST /api/auth/login
 * 用戶登入
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 輸入驗證
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: '請提供 email 和密碼',
      });
    }

    const result = await login(email, password);

    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json({
      success: true,
      message: '登入成功',
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
    });
  } catch (error) {
    console.error('❌ 登入 API 錯誤:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * POST /api/auth/logout
 * 用戶登出
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await logout(refreshToken);
    }

    res.json({
      success: true,
      message: '登出成功',
    });
  } catch (error) {
    console.error('❌ 登出 API 錯誤:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * POST /api/auth/refresh
 * 刷新 Access Token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: '請提供 Refresh Token',
      });
    }

    const result = await refreshAccessToken(refreshToken);

    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json({
      success: true,
      message: 'Token 已刷新',
      data: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
    });
  } catch (error) {
    console.error('❌ 刷新 Token API 錯誤:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * GET /api/auth/me
 * 取得當前用戶資訊
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await getCurrentUser(req.user.userId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json({
      success: true,
      data: result.user,
    });
  } catch (error) {
    console.error('❌ 取得用戶資訊 API 錯誤:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

/**
 * PUT /api/auth/password
 * 修改密碼
 */
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // 輸入驗證
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: '請提供當前密碼和新密碼',
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

    const result = await changePassword(
      req.user.userId,
      currentPassword,
      newPassword
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('❌ 修改密碼 API 錯誤:', error);
    res.status(500).json({
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    });
  }
});

export default router;
