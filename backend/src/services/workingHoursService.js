/**
 * 工作時段服務
 * 金龍永盛客服管理後台
 *
 * 處理工作時間判斷和相關邏輯
 */

import { prisma } from '../db.js';

/**
 * 預設工作時段配置
 */
const DEFAULT_WORKING_HOURS = {
  start: '09:00',
  end: '18:00',
  timezone: 'Asia/Taipei',
  workDays: [1, 2, 3, 4, 5], // 週一至週五
};

/**
 * 取得區域的工作時段配置
 * @param {string} regionId - 區域 ID
 * @returns {Promise<Object>} 工作時段配置
 */
export async function getWorkingHoursConfig(regionId) {
  try {
    const region = await prisma.region.findUnique({
      where: { id: regionId },
      select: { settings: true },
    });

    if (!region || !region.settings) {
      return DEFAULT_WORKING_HOURS;
    }

    const settings = typeof region.settings === 'string'
      ? JSON.parse(region.settings)
      : region.settings;

    return {
      ...DEFAULT_WORKING_HOURS,
      ...settings.workingHours,
    };
  } catch (error) {
    console.error('❌ getWorkingHoursConfig 失敗:', error);
    return DEFAULT_WORKING_HOURS;
  }
}

/**
 * 檢查當前是否在工作時間內
 * @param {string} regionId - 區域 ID
 * @returns {Promise<boolean>} 是否在工作時間內
 */
export async function isWithinWorkingHours(regionId) {
  try {
    const config = await getWorkingHoursConfig(regionId);
    const { start, end, timezone, workDays } = config;

    const now = new Date();

    // 使用 weekday: 'short' 取得星期幾（'numeric' 不是有效選項）
    const localDateStr = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(now);

    const dayNameToNumber = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const currentDay = dayNameToNumber[localDateStr];

    if (!workDays.includes(currentDay)) {
      return false;
    }

    // 取得當地時間 HH:mm
    const currentTime = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);

    // 比較時間
    return currentTime >= start && currentTime <= end;
  } catch (error) {
    console.error('❌ isWithinWorkingHours 失敗:', error);
    // 預設返回 true，避免阻擋正常服務
    return true;
  }
}

/**
 * 取得非工作時間的統一回覆訊息
 * @param {string} regionId - 區域 ID
 * @returns {Promise<string>} 回覆訊息
 */
export async function getOffHoursMessage(regionId) {
  try {
    const config = await getWorkingHoursConfig(regionId);
    const { start, end, workDays } = config;

    // 將工作日數字轉換為中文
    const dayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    const workDayNames = workDays.sort((a, b) => a - b).map(d => dayNames[d]);

    // 格式化工作日顯示
    let workDayText;
    if (workDays.length === 5 && workDays.includes(1) && workDays.includes(5)) {
      workDayText = '週一至週五';
    } else if (workDays.length === 7) {
      workDayText = '每天';
    } else {
      workDayText = workDayNames.join('、');
    }

    return `感謝您的訊息！

此問題需要專人為您服務，目前已超過服務時間：
服務時間：${workDayText} ${start}-${end}

您的訊息已記錄，我們會在上班時間盡快為您處理。

如有緊急需求（72小時內出發），請撥打：
📞 0988-157-972`;
  } catch (error) {
    console.error('❌ getOffHoursMessage 失敗:', error);
    return `感謝您的訊息！目前已超過服務時間，我們會在上班時間盡快回覆您。`;
  }
}

/**
 * 取得下一個工作時間開始的時間點
 * @param {string} regionId - 區域 ID
 * @returns {Promise<Date>} 下一個工作時間開始
 */
export async function getNextWorkingTime(regionId) {
  try {
    const config = await getWorkingHoursConfig(regionId);
    const { start, timezone, workDays } = config;

    const now = new Date();
    const [startHour, startMinute] = start.split(':').map(Number);

    // 取得當地日期
    const localDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    // 從今天開始，找到下一個工作日
    for (let i = 0; i < 8; i++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + i);

      const dayName = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
      }).format(checkDate);

      const dayNameToNumber = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
      };
      const dayNum = dayNameToNumber[dayName];

      if (workDays.includes(dayNum)) {
        // 設定為該日的工作開始時間
        const result = new Date(checkDate);
        result.setHours(startHour, startMinute, 0, 0);

        // 如果是今天且已過開始時間，跳過
        if (i === 0) {
          const currentTime = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(now);

          if (currentTime > start) {
            continue;
          }
        }

        return result;
      }
    }

    // 預設返回明天
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(startHour, startMinute, 0, 0);
    return tomorrow;
  } catch (error) {
    console.error('❌ getNextWorkingTime 失敗:', error);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
}

/**
 * 取得上一個工作日結束時間
 * @param {string} timezone - 時區
 * @param {string} endTime - 結束時間 (HH:mm)
 * @param {number[]} workDays - 工作日
 * @returns {Date} 上一個工作日結束時間
 */
export function getLastWorkingDayEnd(timezone = 'Asia/Taipei', endTime = '18:00', workDays = [1, 2, 3, 4, 5]) {
  const now = new Date();
  const [endHour, endMinute] = endTime.split(':').map(Number);

  for (let i = 0; i < 8; i++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() - i);

    const dayName = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(checkDate);

    const dayNameToNumber = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const dayNum = dayNameToNumber[dayName];

    if (workDays.includes(dayNum)) {
      const result = new Date(checkDate);
      result.setHours(endHour, endMinute, 0, 0);
      return result;
    }
  }

  // 預設返回昨天 18:00
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(18, 0, 0, 0);
  return yesterday;
}

/**
 * 取得今天工作開始時間
 * @param {string} timezone - 時區
 * @param {string} startTime - 開始時間 (HH:mm)
 * @returns {Date} 今天工作開始時間
 */
export function getTodayWorkStart(timezone = 'Asia/Taipei', startTime = '09:00') {
  const now = new Date();
  const [startHour, startMinute] = startTime.split(':').map(Number);

  const result = new Date(now);
  result.setHours(startHour, startMinute, 0, 0);
  return result;
}

export default {
  getWorkingHoursConfig,
  isWithinWorkingHours,
  getOffHoursMessage,
  getNextWorkingTime,
  getLastWorkingDayEnd,
  getTodayWorkStart,
};
