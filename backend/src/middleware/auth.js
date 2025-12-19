/**
 * JWT 認證中間件
 * 金龍永盛客服管理後台
 */

import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * 生成 Access Token 和 Refresh Token
 * @param {Object} user - 用戶物件
 * @returns {Object} { accessToken, refreshToken }
 */
export function generateTokens(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    regionId: user.regionId,
  };

  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  const refreshToken = jwt.sign(
    { userId: user.id },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  return { accessToken, refreshToken };
}

/**
 * 驗證 Access Token
 * @param {string} token
 * @returns {Object|null} 解碼後的 payload 或 null
 */
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (error) {
    return null;
  }
}

/**
 * 驗證 Refresh Token
 * @param {string} token
 * @returns {Object|null} 解碼後的 payload 或 null
 */
export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, config.jwt.refreshSecret);
  } catch (error) {
    return null;
  }
}

/**
 * JWT 認證中間件
 * 驗證請求中的 Bearer Token
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: '請提供有效的認證 Token',
    });
  }

  const token = authHeader.substring(7); // 移除 'Bearer '
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'InvalidToken',
      message: 'Token 無效或已過期',
    });
  }

  // 將用戶資訊附加到 request
  req.user = decoded;
  next();
}

/**
 * 可選認證中間件
 * Token 存在時驗證，不存在時繼續
 */
export function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }

  next();
}

export default {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  authMiddleware,
  optionalAuthMiddleware,
};
