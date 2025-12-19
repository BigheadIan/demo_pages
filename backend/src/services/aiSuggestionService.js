/**
 * AI 推薦回覆服務
 * 金龍永盛客服管理後台
 *
 * 為客服人員生成 AI 推薦回覆
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { searchFAQ, formatFAQContext } from '../faqRetriever.js';
import { prisma } from '../db.js';

let genAI = null;
let suggestionModel = null;

/**
 * AI 推薦回覆的系統 Prompt
 */
const AGENT_SUGGESTION_SYSTEM_PROMPT = `你是金龍永盛旅行社的 AI 助理，正在協助真人客服人員生成回覆建議。

## 你的角色
- 你生成的內容是「推薦回覆」，供客服人員參考和修改
- 客服人員可能直接採用、修改後使用、或完全不使用你的建議
- 你的建議應該專業、完整，但保持彈性讓客服人員調整

## 回覆原則
1. **專業準確**：根據 FAQ 知識庫和對話上下文提供準確資訊
2. **完整但簡潔**：涵蓋客戶問題的所有面向，但避免冗長
3. **可操作**：如需客戶提供資訊，明確列出需要的項目
4. **友善語氣**：使用親切、有禮貌的語氣
5. **適當格式**：使用條列式讓資訊更清晰

## 公司資訊
- 服務時間：週一至週五 9:00-18:00（國定假日休息）
- 緊急聯絡（72小時內出發）：0988-157-972
- 外交部緊急中心：(02)2343-2888

## 注意事項
- 不要使用 markdown 標記（如 **粗體**、# 標題）
- 使用純文字格式
- 可以適當使用表情符號增加親切感`;

/**
 * 初始化 AI 推薦服務
 */
export function initAiSuggestionService() {
  if (!config.gemini.apiKey) {
    console.warn('⚠️ GEMINI_API_KEY 未設定，AI 推薦服務無法使用');
    return false;
  }

  try {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    suggestionModel = genAI.getGenerativeModel({
      model: config.gemini.model,
      systemInstruction: AGENT_SUGGESTION_SYSTEM_PROMPT,
    });
    console.log('✅ AI 推薦回覆服務初始化成功');
    return true;
  } catch (error) {
    console.error('❌ AI 推薦服務初始化失敗:', error);
    return false;
  }
}

/**
 * 生成 AI 推薦回覆
 * @param {string} conversationId - 對話 ID
 * @param {Object} [options] - 選項
 * @param {number} [options.historyLimit] - 對話歷史數量限制
 * @param {boolean} [options.includeFAQ] - 是否包含 FAQ 上下文
 * @returns {Promise<Object>} 推薦回覆結果
 */
export async function generateSuggestedReply(conversationId, options = {}) {
  const {
    historyLimit = 10,
    includeFAQ = true,
  } = options;

  // 確保服務已初始化
  if (!suggestionModel) {
    initAiSuggestionService();
    if (!suggestionModel) {
      return {
        success: false,
        error: 'AI 推薦服務未初始化',
      };
    }
  }

  const startTime = Date.now();

  try {
    // 1. 取得對話和最近訊息
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: {
          select: {
            displayName: true,
            vipLevel: true,
            notes: true,
          },
        },
        messages: {
          take: historyLimit,
          orderBy: { createdAt: 'desc' },
          select: {
            senderType: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) {
      return {
        success: false,
        error: '找不到對話',
      };
    }

    // 反轉訊息順序（從舊到新）
    const messages = conversation.messages.reverse();

    if (messages.length === 0) {
      return {
        success: false,
        error: '對話中沒有訊息',
      };
    }

    // 取得最後一條客戶訊息
    const lastCustomerMessage = messages
      .filter(m => m.senderType === 'CUSTOMER')
      .pop();

    if (!lastCustomerMessage) {
      return {
        success: false,
        error: '沒有客戶訊息',
      };
    }

    // 2. 搜尋相關 FAQ（如果啟用）
    let faqContext = '';
    let matchedFAQs = [];
    if (includeFAQ) {
      const relevantFAQs = searchFAQ(lastCustomerMessage.content, 5);
      if (relevantFAQs.length > 0) {
        faqContext = formatFAQContext(relevantFAQs);
        matchedFAQs = relevantFAQs.map(f => ({
          id: f.id,
          question: f.question,
          score: f.score,
        }));
      }
    }

    // 3. 構建對話上下文
    const historyText = messages.map(m => {
      const role = m.senderType === 'CUSTOMER' ? '客戶' :
                   m.senderType === 'AGENT' ? '客服' : 'AI';
      return `[${role}]: ${m.content}`;
    }).join('\n');

    // 4. 構建 Prompt
    let prompt = `## 客戶資訊
- 名稱：${conversation.customer?.displayName || '未知'}
- VIP 等級：${conversation.customer?.vipLevel || 0}

## 對話歷史
${historyText}

## 客戶最新訊息
${lastCustomerMessage.content}
`;

    if (faqContext) {
      prompt += `
## 相關 FAQ 參考
${faqContext}
`;
    }

    prompt += `
## 任務
請根據以上對話上下文和 FAQ 參考，生成一個專業、友善的回覆建議，供客服人員參考。
回覆應該直接回應客戶的問題或需求。

推薦回覆：`;

    // 5. 呼叫 Gemini API
    const result = await suggestionModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,  // 稍高的溫度讓回覆更自然
        maxOutputTokens: 500,
      },
    });

    const response = result.response;
    const suggestedReply = response.text().trim();

    const endTime = Date.now();

    return {
      success: true,
      suggestedReply,
      metadata: {
        conversationId,
        customerMessage: lastCustomerMessage.content,
        matchedFAQs,
        processingTime: endTime - startTime,
        model: config.gemini.model,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('❌ 生成推薦回覆失敗:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 為訊息生成推薦回覆並存入 metadata
 * @param {string} messageId - 訊息 ID
 * @param {string} conversationId - 對話 ID
 * @returns {Promise<Object>} 更新後的訊息
 */
export async function generateAndSaveSuggestedReply(messageId, conversationId) {
  try {
    const result = await generateSuggestedReply(conversationId);

    if (!result.success) {
      console.warn(`⚠️ 無法生成推薦回覆: ${result.error}`);
      return null;
    }

    // 更新訊息的 metadata
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        metadata: {
          suggestedReply: result.suggestedReply,
          suggestedReplyGeneratedAt: result.metadata.generatedAt,
          matchedFAQs: result.metadata.matchedFAQs,
        },
      },
    });

    console.log(`💡 已為訊息 ${messageId} 生成推薦回覆`);
    return updatedMessage;
  } catch (error) {
    console.error('❌ 儲存推薦回覆失敗:', error);
    return null;
  }
}

/**
 * 取得對話最新訊息的推薦回覆
 * @param {string} conversationId - 對話 ID
 * @returns {Promise<Object>} 推薦回覆資訊
 */
export async function getLatestSuggestedReply(conversationId) {
  try {
    // 找最新的客戶訊息
    const latestCustomerMessage = await prisma.message.findFirst({
      where: {
        conversationId,
        senderType: 'CUSTOMER',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
    });

    if (!latestCustomerMessage) {
      return {
        success: false,
        error: '沒有客戶訊息',
      };
    }

    const metadata = latestCustomerMessage.metadata || {};

    // 如果已有推薦回覆，直接返回
    if (metadata.suggestedReply) {
      return {
        success: true,
        messageId: latestCustomerMessage.id,
        customerMessage: latestCustomerMessage.content,
        suggestedReply: metadata.suggestedReply,
        generatedAt: metadata.suggestedReplyGeneratedAt,
        matchedFAQs: metadata.matchedFAQs || [],
        cached: true,
      };
    }

    // 沒有推薦回覆，即時生成
    const result = await generateSuggestedReply(conversationId);

    if (!result.success) {
      return result;
    }

    // 存入訊息 metadata
    await prisma.message.update({
      where: { id: latestCustomerMessage.id },
      data: {
        metadata: {
          ...metadata,
          suggestedReply: result.suggestedReply,
          suggestedReplyGeneratedAt: result.metadata.generatedAt,
          matchedFAQs: result.metadata.matchedFAQs,
        },
      },
    });

    return {
      success: true,
      messageId: latestCustomerMessage.id,
      customerMessage: latestCustomerMessage.content,
      suggestedReply: result.suggestedReply,
      generatedAt: result.metadata.generatedAt,
      matchedFAQs: result.metadata.matchedFAQs,
      cached: false,
    };
  } catch (error) {
    console.error('❌ getLatestSuggestedReply 失敗:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default {
  initAiSuggestionService,
  generateSuggestedReply,
  generateAndSaveSuggestedReply,
  getLatestSuggestedReply,
};
