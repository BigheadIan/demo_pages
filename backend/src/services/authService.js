/**
 * 認證服務
 * 金龍永盛客服管理後台
 */

import { prisma } from '../db.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateTokens, verifyRefreshToken } from '../middleware/auth.js';
import { config } from '../config.js';

/**
 * 用戶登入
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} { success, user, tokens, error }
 */
export async function login(email, password) {
  try {
    // 查找用戶
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        region: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!user) {
      return {
        success: false,
        error: 'InvalidCredentials',
        message: '帳號或密碼錯誤',
      };
    }

    // 檢查用戶狀態
    if (user.status !== 'ACTIVE') {
      return {
        success: false,
        error: 'AccountInactive',
        message: '帳號已停用，請聯繫管理員',
      };
    }

    // 驗證密碼
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return {
        success: false,
        error: 'InvalidCredentials',
        message: '帳號或密碼錯誤',
      };
    }

    // 生成 Token
    const tokens = generateTokens(user);

    // 儲存 Refresh Token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 天
      },
    });

    // 更新最後登入時間
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // 移除敏感資訊
    const { passwordHash, ...safeUser } = user;

    return {
      success: true,
      user: safeUser,
      tokens,
    };
  } catch (error) {
    console.error('❌ 登入失敗:', error);
    return {
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤，請稍後再試',
    };
  }
}

/**
 * 登出
 * @param {string} refreshToken
 */
export async function logout(refreshToken) {
  try {
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
    return { success: true };
  } catch (error) {
    console.error('❌ 登出失敗:', error);
    return { success: false };
  }
}

/**
 * 刷新 Token
 * @param {string} refreshToken
 * @returns {Promise<Object>} { success, tokens, error }
 */
export async function refreshAccessToken(refreshToken) {
  try {
    // 驗證 Refresh Token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return {
        success: false,
        error: 'InvalidToken',
        message: 'Refresh Token 無效',
      };
    }

    // 檢查資料庫中的 Token
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      return {
        success: false,
        error: 'TokenExpired',
        message: 'Refresh Token 已過期',
      };
    }

    // 查找用戶
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        region: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      return {
        success: false,
        error: 'UserInactive',
        message: '用戶不存在或已停用',
      };
    }

    // 刪除舊的 Refresh Token
    await prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    // 生成新的 Token
    const tokens = generateTokens(user);

    // 儲存新的 Refresh Token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      success: true,
      tokens,
    };
  } catch (error) {
    console.error('❌ 刷新 Token 失敗:', error);
    return {
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    };
  }
}

/**
 * 取得當前用戶資訊
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function getCurrentUser(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        region: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!user) {
      return {
        success: false,
        error: 'UserNotFound',
        message: '用戶不存在',
      };
    }

    const { passwordHash, ...safeUser } = user;

    return {
      success: true,
      user: safeUser,
    };
  } catch (error) {
    console.error('❌ 取得用戶資訊失敗:', error);
    return {
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    };
  }
}

/**
 * 修改密碼
 * @param {string} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 */
export async function changePassword(userId, currentPassword, newPassword) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return {
        success: false,
        error: 'UserNotFound',
        message: '用戶不存在',
      };
    }

    // 驗證當前密碼
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return {
        success: false,
        error: 'InvalidPassword',
        message: '當前密碼錯誤',
      };
    }

    // 更新密碼
    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // 清除所有 Refresh Token（強制重新登入）
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });

    return {
      success: true,
      message: '密碼已更新，請重新登入',
    };
  } catch (error) {
    console.error('❌ 修改密碼失敗:', error);
    return {
      success: false,
      error: 'ServerError',
      message: '伺服器錯誤',
    };
  }
}

/**
 * 初始化管理員帳號（如果不存在）
 */
export async function initializeAdmin() {
  try {
    const adminExists = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    });

    if (adminExists) {
      console.log('✅ 管理員帳號已存在');
      return { created: false };
    }

    const passwordHash = await hashPassword(config.admin.password);

    const admin = await prisma.user.create({
      data: {
        email: config.admin.email,
        passwordHash,
        name: '系統管理員',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });

    console.log(`✅ 已建立管理員帳號: ${admin.email}`);
    return { created: true, email: admin.email };
  } catch (error) {
    console.error('❌ 初始化管理員失敗:', error);
    return { created: false, error };
  }
}

/**
 * 清理過期的 Refresh Token
 */
export async function cleanupExpiredTokens() {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    console.log(`🧹 已清理 ${result.count} 個過期 Token`);
    return result.count;
  } catch (error) {
    console.error('❌ 清理過期 Token 失敗:', error);
    return 0;
  }
}

export default {
  login,
  logout,
  refreshAccessToken,
  getCurrentUser,
  changePassword,
  initializeAdmin,
  cleanupExpiredTokens,
};
