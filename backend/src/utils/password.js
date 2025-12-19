/**
 * 密碼工具函數
 * 金龍永盛客服管理後台
 */

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * 雜湊密碼
 * @param {string} password - 明文密碼
 * @returns {Promise<string>} 雜湊後的密碼
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * 驗證密碼
 * @param {string} password - 明文密碼
 * @param {string} hashedPassword - 雜湊後的密碼
 * @returns {Promise<boolean>} 是否匹配
 */
export async function verifyPassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * 密碼強度檢查
 * @param {string} password - 密碼
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function checkPasswordStrength(password) {
  const errors = [];

  if (password.length < 8) {
    errors.push('密碼長度至少 8 個字元');
  }

  if (password.length > 100) {
    errors.push('密碼長度不能超過 100 個字元');
  }

  // 可選：強制要求特殊字元
  // if (!/[A-Z]/.test(password)) {
  //   errors.push('密碼需包含至少一個大寫字母');
  // }
  // if (!/[a-z]/.test(password)) {
  //   errors.push('密碼需包含至少一個小寫字母');
  // }
  // if (!/[0-9]/.test(password)) {
  //   errors.push('密碼需包含至少一個數字');
  // }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  hashPassword,
  verifyPassword,
  checkPasswordStrength,
};
