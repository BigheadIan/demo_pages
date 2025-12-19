/**
 * 创建测试对话并测试 AI 推荐回覆
 */

import { prisma } from './src/db.js';
const BASE_URL = 'http://localhost:3001';

async function login() {
  const res = await fetch(BASE_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@golden-dragon.com',
      password: 'admin123456'
    })
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error('登入失败: ' + JSON.stringify(data));
  }
  return data.data;
}

async function setAgentOnline(token) {
  const res = await fetch(BASE_URL + '/api/agent/status', {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'ONLINE' })
  });
  return res.json();
}

async function getSuggestedReply(token, conversationId) {
  const res = await fetch(BASE_URL + '/api/agent/conversation/' + conversationId + '/suggested-reply', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  return res.json();
}

async function getConversationMessages(token, conversationId) {
  const res = await fetch(BASE_URL + '/api/agent/conversation/' + conversationId + '/messages', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  return res.json();
}

async function main() {
  console.log('🧪 创建测试对话并测试 AI 推荐回覆\n');
  console.log('='.repeat(60));

  try {
    // 1. 登入获取用户信息
    console.log('\n1️⃣ 登入系统...');
    const loginData = await login();
    const token = loginData.token;
    const userId = loginData.user.id;
    console.log('✅ 登入成功，用户 ID: ' + userId);

    // 设置客服上线
    await setAgentOnline(token);
    console.log('✅ 客服已上线');

    // 2. 获取或创建区域
    console.log('\n2️⃣ 获取区域...');
    let region = await prisma.region.findFirst({
      where: { isActive: true }
    });

    if (!region) {
      region = await prisma.region.create({
        data: {
          code: 'TEST',
          name: '测试区域',
          settings: {
            workingHours: {
              start: '09:00',
              end: '18:00',
              timezone: 'Asia/Taipei',
              workDays: [1, 2, 3, 4, 5]
            }
          }
        }
      });
      console.log('✅ 已创建测试区域');
    } else {
      console.log('✅ 使用现有区域: ' + region.name);
    }

    // 3. 创建测试客户
    console.log('\n3️⃣ 创建测试客户...');
    const customer = await prisma.customer.upsert({
      where: {
        regionId_source_sourceUserId: {
          regionId: region.id,
          source: 'LINE',
          sourceUserId: 'test_user_' + Date.now()
        }
      },
      update: {},
      create: {
        regionId: region.id,
        source: 'LINE',
        sourceUserId: 'test_user_' + Date.now(),
        displayName: '测试客户 - 王小明',
        vipLevel: 2
      }
    });
    console.log('✅ 客户已创建: ' + customer.displayName);

    // 4. 创建测试对话
    console.log('\n4️⃣ 创建测试对话...');
    const conversation = await prisma.conversation.create({
      data: {
        customerId: customer.id,
        regionId: region.id,
        source: 'LINE',
        sourceConversationId: 'test_conv_' + Date.now(),
        status: 'ASSIGNED',  // 直接设为已接手状态
        assignedAgentId: userId,
        messageCount: 0
      }
    });
    console.log('✅ 对话已创建: ' + conversation.id);

    // 5. 添加测试消息
    console.log('\n5️⃣ 添加测试消息...');

    // 客户第一条消息
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'CUSTOMER',
        contentType: 'TEXT',
        content: '你好，我想询问一下去日本东京的机票价格'
      }
    });
    console.log('   [客户] 你好，我想询问一下去日本东京的机票价格');

    // AI 回覆
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'BOT',
        contentType: 'TEXT',
        content: '您好！感谢您的询问。请问您预计什么时间出发？几位旅客？需要商务舱还是经济舱呢？'
      }
    });
    console.log('   [AI] 您好！感谢您的询问...');

    // 客户第二条消息 - 这是最新消息，用于测试 AI 推荐
    const latestMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'CUSTOMER',
        contentType: 'TEXT',
        content: '预计下个月15号出发，2个人，经济舱就好。另外想问一下改票需要多少钱？'
      }
    });
    console.log('   [客户] 预计下个月15号出发，2个人，经济舱就好。另外想问一下改票需要多少钱？');

    // 更新对话消息数
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { messageCount: 3, lastMessageAt: new Date() }
    });

    // 6. 获取对话消息
    console.log('\n6️⃣ 获取对话消息...');
    const messages = await getConversationMessages(token, conversation.id);
    console.log('   消息总数: ' + messages.pagination?.total);

    // 7. 测试 AI 推荐回覆
    console.log('\n7️⃣ 测试 AI 推荐回覆...');
    console.log('   正在生成推荐回覆，请稍候...');

    const suggestion = await getSuggestedReply(token, conversation.id);

    if (suggestion.success && suggestion.data?.suggestedReply) {
      console.log('\n   ✅ AI 推荐回覆生成成功！');
      console.log('   ┌' + '─'.repeat(56) + '┐');
      const lines = suggestion.data.suggestedReply.split('\n');
      lines.forEach(line => {
        if (line.length <= 54) {
          console.log('   │ ' + line.padEnd(54) + ' │');
        } else {
          for (let i = 0; i < line.length; i += 54) {
            const chunk = line.slice(i, i + 54);
            console.log('   │ ' + chunk.padEnd(54) + ' │');
          }
        }
      });
      console.log('   └' + '─'.repeat(56) + '┘');

      console.log('\n   📊 详细信息:');
      console.log('   - 来源: ' + (suggestion.data.cached ? '快取' : '即时生成'));
      console.log('   - 客户消息: ' + suggestion.data.customerMessage);
      console.log('   - 生成时间: ' + suggestion.data.generatedAt);
      if (suggestion.data.matchedFAQs?.length > 0) {
        console.log('   - 匹配 FAQ: ' + suggestion.data.matchedFAQs.length + ' 条');
        suggestion.data.matchedFAQs.forEach((faq, i) => {
          console.log('     ' + (i + 1) + '. ' + faq.question + ' (分数: ' + faq.score + ')');
        });
      }
    } else {
      console.log('\n   ⚠️ 无法生成推荐回覆');
      console.log('   错误: ' + (suggestion.message || JSON.stringify(suggestion)));
    }

    // 8. 清理测试数据（可选）
    console.log('\n8️⃣ 保留测试数据供后续测试使用');
    console.log('   对话 ID: ' + conversation.id);
    console.log('   客户 ID: ' + customer.id);

    console.log('\n' + '='.repeat(60));
    console.log('✅ 测试完成！');
    console.log('\n💡 提示: 你可以在前端客服工作台查看这个对话');
    console.log('   或使用以下命令清理测试数据:');
    console.log('   npx prisma studio');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

main();
