/**
 * 角色權限控制中間件 (RBAC)
 * 金龍永盛客服管理後台
 */

// 角色層級定義
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  REGION_ADMIN: 'REGION_ADMIN',
  AGENT: 'AGENT',
};

// 角色權限層級（數字越大權限越高）
const ROLE_LEVELS = {
  AGENT: 1,
  REGION_ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * 檢查用戶是否具有指定角色
 * @param {string} userRole - 用戶角色
 * @param {string[]} allowedRoles - 允許的角色列表
 * @returns {boolean}
 */
export function hasRole(userRole, allowedRoles) {
  return allowedRoles.includes(userRole);
}

/**
 * 檢查用戶是否具有最低角色等級
 * @param {string} userRole - 用戶角色
 * @param {string} minRole - 最低要求角色
 * @returns {boolean}
 */
export function hasMinimumRole(userRole, minRole) {
  return (ROLE_LEVELS[userRole] || 0) >= (ROLE_LEVELS[minRole] || 0);
}

/**
 * 角色限制中間件
 * 只允許指定角色訪問
 * @param {...string} allowedRoles - 允許的角色
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: '請先登入',
      });
    }

    if (!hasRole(req.user.role, allowedRoles)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '您沒有權限執行此操作',
        requiredRoles: allowedRoles,
        yourRole: req.user.role,
      });
    }

    next();
  };
}

/**
 * 最低角色等級中間件
 * @param {string} minRole - 最低要求角色
 */
export function requireMinimumRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: '請先登入',
      });
    }

    if (!hasMinimumRole(req.user.role, minRole)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '您的權限等級不足',
        requiredMinRole: minRole,
        yourRole: req.user.role,
      });
    }

    next();
  };
}

/**
 * 區域訪問控制中間件
 * SUPER_ADMIN 可訪問所有區域
 * 其他角色只能訪問自己的區域
 */
export function requireRegionAccess(regionIdParam = 'regionId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: '請先登入',
      });
    }

    // SUPER_ADMIN 可訪問所有區域
    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next();
    }

    // 從 params、query 或 body 取得 regionId
    const regionId =
      req.params[regionIdParam] ||
      req.query[regionIdParam] ||
      req.body?.[regionIdParam];

    // 如果沒有指定區域，使用用戶所屬區域
    if (!regionId) {
      return next();
    }

    // 檢查是否為用戶所屬區域
    if (req.user.regionId !== regionId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '您無法訪問此區域的資源',
        yourRegion: req.user.regionId,
        requestedRegion: regionId,
      });
    }

    next();
  };
}

/**
 * 自身資源訪問控制
 * 用戶只能訪問自己的資源，或由更高權限角色訪問
 */
export function requireSelfOrAdmin(userIdParam = 'userId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: '請先登入',
      });
    }

    const targetUserId = req.params[userIdParam];

    // SUPER_ADMIN 可訪問所有用戶
    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next();
    }

    // 訪問自己的資源
    if (req.user.userId === targetUserId) {
      return next();
    }

    // REGION_ADMIN 需要額外檢查是否同區域（此處簡化，實際需查詢資料庫）
    // 目前只允許訪問自己的資源
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: '您只能訪問自己的資源',
    });
  };
}

/**
 * 添加區域過濾條件到查詢
 * 根據用戶角色自動添加區域過濾
 */
export function getRegionFilter(user) {
  if (user.role === ROLES.SUPER_ADMIN) {
    return {}; // 不過濾
  }
  return { regionId: user.regionId };
}

export default {
  ROLES,
  hasRole,
  hasMinimumRole,
  requireRole,
  requireMinimumRole,
  requireRegionAccess,
  requireSelfOrAdmin,
  getRegionFilter,
};
