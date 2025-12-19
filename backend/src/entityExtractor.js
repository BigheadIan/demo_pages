/**
 * 金龍永盛 AI 客服系統 - 實體提取模組
 *
 * 使用正則表達式和規則來提取和標準化實體
 */

// 實體類型定義
export const ENTITY_TYPES = {
  DATE: '日期',
  FLIGHT_NO: '航班號',
  DESTINATION: '目的地',
  PASSENGERS: '旅客人數',
  PASSENGER_NAME: '旅客姓名',
  BOOKING_REF: '訂位代號',
  AIRLINE: '航空公司',
  CLASS: '艙等',
  DIRECTION: '方向',
  TIME_PREFERENCE: '時間偏好',
  SEAT_PREFERENCE: '座位偏好',
  TAX_ID: '統一編號',
  PHONE: '電話號碼',
  EMAIL: '電子郵件',
};

// 航空公司代碼對照表
const AIRLINES = {
  'CX': '國泰航空',
  'BR': '長榮航空',
  'CI': '中華航空',
  'SQ': '新加坡航空',
  'TG': '泰國航空',
  'JL': '日本航空',
  'NH': 'ANA全日空',
  'KE': '大韓航空',
  'OZ': '韓亞航空',
  'MH': '馬來西亞航空',
  'VN': '越南航空',
  'CA': '中國國際航空',
  'MU': '東方航空',
  'CZ': '南方航空',
  'HX': '香港航空',
  'UO': '香港快運',
  'TR': '酷航',
  'AK': '亞洲航空',
  'IT': '台灣虎航',
  'MM': '樂桃航空',
};

// 城市/機場代碼對照表
const DESTINATIONS = {
  // 台灣
  'TPE': '台北',
  'KHH': '高雄',
  'RMQ': '台中',
  // 中國大陸
  'PVG': '上海浦東',
  'SHA': '上海虹橋',
  'PEK': '北京',
  'CAN': '廣州',
  'SZX': '深圳',
  'XMN': '廈門',
  'HGH': '杭州',
  // 東北亞
  'NRT': '東京成田',
  'HND': '東京羽田',
  'KIX': '大阪',
  'ICN': '首爾仁川',
  'GMP': '首爾金浦',
  // 東南亞
  'SIN': '新加坡',
  'BKK': '曼谷',
  'KUL': '吉隆坡',
  'SGN': '胡志明市',
  'HAN': '河內',
  'MNL': '馬尼拉',
  // 港澳
  'HKG': '香港',
  'MFM': '澳門',
};

// 反向查詢（中文 -> 代碼）
const DESTINATION_CODES = Object.fromEntries(
  Object.entries(DESTINATIONS).map(([code, name]) => [name, code])
);

/**
 * 提取日期實體
 * @param {string} text - 輸入文字
 * @returns {Array} 提取到的日期列表
 */
export function extractDates(text) {
  const dates = [];
  const matchedPositions = new Set();

  // 格式：2025/03/26, 2025-03-26（優先匹配完整日期）
  const fullDateRegex = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g;
  let match;
  while ((match = fullDateRegex.exec(text)) !== null) {
    dates.push({
      original: match[0],
      normalized: `${match[1]}/${match[2].padStart(2, '0')}/${match[3].padStart(2, '0')}`,
    });
    // 記錄已匹配的位置範圍
    for (let i = match.index; i < match.index + match[0].length; i++) {
      matchedPositions.add(i);
    }
  }

  // 格式：3/26, 03/26（排除已被完整日期匹配的部分）
  const shortDateRegex = /(?<!\d)(\d{1,2})[\/](\d{1,2})(?!\d)/g;
  while ((match = shortDateRegex.exec(text)) !== null) {
    // 檢查是否已被匹配
    if (!matchedPositions.has(match.index)) {
      const year = new Date().getFullYear();
      dates.push({
        original: match[0],
        normalized: `${year}/${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}`,
      });
    }
  }

  // 格式：3月26日
  const chineseDateRegex = /(\d{1,2})月(\d{1,2})日?/g;
  while ((match = chineseDateRegex.exec(text)) !== null) {
    const year = new Date().getFullYear();
    dates.push({
      original: match[0],
      normalized: `${year}/${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}`,
    });
  }

  return dates;
}

/**
 * 提取航班號
 * @param {string} text - 輸入文字
 * @returns {Array} 提取到的航班號列表
 */
export function extractFlightNumbers(text) {
  const flights = [];

  // 格式：CX472, BR867, CI123
  // 排除 BTE 開頭（訂位代號）
  const flightRegex = /\b(?!BTE)([A-Z]{2})[\s]?(\d{2,4})\b/gi;
  let match;
  while ((match = flightRegex.exec(text)) !== null) {
    const airlineCode = match[1].toUpperCase();
    const flightNum = match[2];
    // 確認是有效的航空公司代碼
    if (AIRLINES[airlineCode]) {
      flights.push({
        original: match[0],
        normalized: `${airlineCode}${flightNum}`,
        airline: AIRLINES[airlineCode],
      });
    }
  }

  return flights;
}

/**
 * 提取訂位代號
 * @param {string} text - 輸入文字
 * @returns {Array} 提取到的訂位代號列表
 */
export function extractBookingRefs(text) {
  const refs = [];

  // 格式：BTE2500208（金龍內部代號）
  const internalRefRegex = /BTE\d{7,}/gi;
  let match;
  while ((match = internalRefRegex.exec(text)) !== null) {
    refs.push({
      original: match[0],
      normalized: match[0].toUpperCase(),
      type: 'internal',
    });
  }

  // 格式：6碼英數混合（航空公司 PNR）
  const pnrRegex = /\b([A-Z0-9]{6})\b/g;
  while ((match = pnrRegex.exec(text)) !== null) {
    // 排除純數字和純字母（太容易誤判）
    if (/[A-Z]/.test(match[1]) && /[0-9]/.test(match[1])) {
      refs.push({
        original: match[0],
        normalized: match[1].toUpperCase(),
        type: 'pnr',
      });
    }
  }

  return refs;
}

/**
 * 提取目的地
 * @param {string} text - 輸入文字
 * @returns {Array} 提取到的目的地列表
 */
export function extractDestinations(text) {
  const destinations = [];

  // 機場代碼
  const codeRegex = /\b([A-Z]{3})\b/g;
  let match;
  while ((match = codeRegex.exec(text)) !== null) {
    if (DESTINATIONS[match[1]]) {
      destinations.push({
        original: match[0],
        normalized: DESTINATIONS[match[1]],
        code: match[1],
      });
    }
  }

  // 中文城市名
  for (const [code, name] of Object.entries(DESTINATIONS)) {
    if (text.includes(name)) {
      destinations.push({
        original: name,
        normalized: name,
        code: code,
      });
    }
  }

  // 常見國家/城市（沒有代碼的）
  const commonPlaces = ['泰國', '日本', '韓國', '新加坡', '馬來西亞', '越南', '菲律賓', '印度', '歐洲', '美國'];
  for (const place of commonPlaces) {
    if (text.includes(place)) {
      destinations.push({
        original: place,
        normalized: place,
        code: null,
      });
    }
  }

  return destinations;
}

/**
 * 提取艙等
 * @param {string} text - 輸入文字
 * @returns {Object|null} 艙等資訊
 */
export function extractClass(text) {
  const classMap = {
    '商務艙': 'BUSINESS',
    '商務': 'BUSINESS',
    'business': 'BUSINESS',
    '經濟艙': 'ECONOMY',
    '經濟': 'ECONOMY',
    'economy': 'ECONOMY',
    '頭等艙': 'FIRST',
    '頭等': 'FIRST',
    'first': 'FIRST',
    '豪華經濟艙': 'PREMIUM_ECONOMY',
    '豪經艙': 'PREMIUM_ECONOMY',
  };

  const lowerText = text.toLowerCase();
  for (const [keyword, code] of Object.entries(classMap)) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return { original: keyword, normalized: code };
    }
  }

  return null;
}

/**
 * 提取方向（去程/回程）
 * @param {string} text - 輸入文字
 * @returns {Object|null} 方向資訊
 */
export function extractDirection(text) {
  if (text.includes('去程') || text.includes('出發')) {
    return { original: text.match(/去程|出發/)[0], normalized: 'OUTBOUND' };
  }
  if (text.includes('回程') || text.includes('返程')) {
    return { original: text.match(/回程|返程/)[0], normalized: 'INBOUND' };
  }
  return null;
}

/**
 * 提取座位偏好
 * @param {string} text - 輸入文字
 * @returns {Object|null} 座位偏好
 */
export function extractSeatPreference(text) {
  if (text.includes('靠窗') || text.includes('窗邊')) {
    return { original: text.match(/靠窗|窗邊/)[0], normalized: 'WINDOW' };
  }
  if (text.includes('走道') || text.includes('靠走道')) {
    return { original: text.match(/走道|靠走道/)[0], normalized: 'AISLE' };
  }
  if (text.includes('前排') || text.includes('前面')) {
    return { original: text.match(/前排|前面/)[0], normalized: 'FRONT' };
  }
  return null;
}

/**
 * 提取旅客人數
 * @param {string} text - 輸入文字
 * @returns {Object|null} 人數資訊
 */
export function extractPassengers(text) {
  // 數字 + 位/人/個人
  const patterns = [
    /(\d+)\s*位/,
    /(\d+)\s*人/,
    /(\d+)\s*個人/,
    /(\d+)\s*大人/,
    /(\d+)\s*位大人/,
    /^(\d+)$/,  // 純數字（在對話上下文中）
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count >= 1 && count <= 50) {  // 合理範圍
        return { original: match[0], normalized: count.toString(), count };
      }
    }
  }

  // 中文數字
  const chineseNumMap = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '兩': 2,
  };

  const chinesePattern = /([一二三四五六七八九十兩])\s*位/;
  const chineseMatch = text.match(chinesePattern);
  if (chineseMatch && chineseNumMap[chineseMatch[1]]) {
    const count = chineseNumMap[chineseMatch[1]];
    return { original: chineseMatch[0], normalized: count.toString(), count };
  }

  return null;
}

/**
 * 提取統一編號
 * @param {string} text - 輸入文字
 * @returns {Object|null} 統一編號
 */
export function extractTaxId(text) {
  const taxIdRegex = /(\d{8})/g;
  const match = taxIdRegex.exec(text);
  if (match && text.includes('統編') || text.includes('統一編號')) {
    return { original: match[0], normalized: match[0] };
  }

  // 獨立的8位數字也可能是統編
  const standaloneRegex = /\b(\d{8})\b/g;
  const standaloneMatch = standaloneRegex.exec(text);
  if (standaloneMatch) {
    return { original: standaloneMatch[0], normalized: standaloneMatch[0] };
  }

  return null;
}

/**
 * 提取電話號碼
 * @param {string} text - 輸入文字
 * @returns {Array} 電話號碼列表
 */
export function extractPhones(text) {
  const phones = [];

  // 台灣手機：09xx-xxx-xxx
  const mobileRegex = /09\d{2}[\-\s]?\d{3}[\-\s]?\d{3}/g;
  let match;
  while ((match = mobileRegex.exec(text)) !== null) {
    phones.push({
      original: match[0],
      normalized: match[0].replace(/[\-\s]/g, ''),
      type: 'mobile',
    });
  }

  // 市話：(02)xxxx-xxxx
  const telRegex = /\(?\d{2,3}\)?[\-\s]?\d{4}[\-\s]?\d{4}/g;
  while ((match = telRegex.exec(text)) !== null) {
    phones.push({
      original: match[0],
      normalized: match[0].replace(/[\-\s\(\)]/g, ''),
      type: 'tel',
    });
  }

  return phones;
}

/**
 * 綜合提取所有實體
 * @param {string} text - 輸入文字
 * @returns {Object} 所有提取到的實體
 */
export function extractAllEntities(text) {
  return {
    dates: extractDates(text),
    flightNumbers: extractFlightNumbers(text),
    bookingRefs: extractBookingRefs(text),
    destinations: extractDestinations(text),
    passengers: extractPassengers(text),
    class: extractClass(text),
    direction: extractDirection(text),
    seatPreference: extractSeatPreference(text),
    taxId: extractTaxId(text),
    phones: extractPhones(text),
  };
}

/**
 * 將實體轉換為扁平格式（用於 API 回應）
 */
export function flattenEntities(entities) {
  const flat = {};

  if (entities.dates?.length > 0) {
    flat.date = entities.dates[0].normalized;
    if (entities.dates.length > 1) {
      flat.date_return = entities.dates[1].normalized;
    }
  }

  if (entities.flightNumbers?.length > 0) {
    flat.flight_no = entities.flightNumbers[0].normalized;
    flat.airline = entities.flightNumbers[0].airline;
  }

  if (entities.bookingRefs?.length > 0) {
    flat.booking_ref = entities.bookingRefs[0].normalized;
  }

  if (entities.destinations?.length > 0) {
    flat.destination = entities.destinations[0].normalized;
    if (entities.destinations[0].code) {
      flat.destination_code = entities.destinations[0].code;
    }
  }

  if (entities.passengers) {
    flat.passengers = entities.passengers.normalized;
  }

  if (entities.class) {
    flat.class = entities.class.normalized;
  }

  if (entities.direction) {
    flat.direction = entities.direction.normalized;
  }

  if (entities.seatPreference) {
    flat.seat_preference = entities.seatPreference.normalized;
  }

  if (entities.taxId) {
    flat.tax_id = entities.taxId.normalized;
  }

  if (entities.phones?.length > 0) {
    flat.phone = entities.phones[0].normalized;
  }

  return flat;
}

export default {
  ENTITY_TYPES,
  AIRLINES,
  DESTINATIONS,
  extractDates,
  extractFlightNumbers,
  extractBookingRefs,
  extractDestinations,
  extractPassengers,
  extractClass,
  extractDirection,
  extractSeatPreference,
  extractTaxId,
  extractPhones,
  extractAllEntities,
  flattenEntities,
};
