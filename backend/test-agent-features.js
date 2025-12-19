/**
 * 测试客服工作台新功能
 * - AI 推荐回覆
 * - 对话管理
 */

const BASE_URL = 'http://localhost:3001';

async function login() {
  const res = await fetch(BASE_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@golden-dragon.com',
      password: process.env.ADMIN_PASSWORD || 'admin123456'
    })
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error('登入失败: ' + JSON.stringify(data));
  }
  return data.data.token;
}

async function getQueue(token) {
  const res = await fetch(BASE_URL + '/api/agent/queue', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  return res.json();
}

async function getActiveConversations(token) {
  const res = await fetch(BASE_URL + '/api/agent/active', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  return res.json();
}

async function acceptConversation(token, conversationId) {
  // 先設定客服上線
  await fetch(BASE_URL + '/api/agent/status', {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'ONLINE' })
  });

  const res = await fetch(BASE_URL + '/api/agent/accept/' + conversationId, {
    method: 'POST',
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

async function getSuggestedReply(token, conversationId) {
  const res = await fetch(BASE_URL + '/api/agent/conversation/' + conversationId + '/suggested-reply', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  return res.json();
}

async function sendReply(token, conversationId, content) {
  const res = await fetch(BASE_URL + '/api/agent/reply/' + conversationId, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  });
  return res.json();
}

async function closeConversation(token, conversationId, summary) {
  const res = await fetch(BASE_URL + '/api/agent/close/' + conversationId, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ summary })
  });
  return res.json();
}

async function main() {
  console.log('🧪 测试客服工作台新功能\n');
  console.log('='.repeat(60));

  try {
    // 1. 登入
    console.log('\n1️⃣ 登入系统...');
    const token = await login();
    console.log('✅ 登入成功');

    // 2. 查看等待佇列
    console.log('\n2️⃣ 查看等待佇列...');
    const queue = await getQueue(token);
    console.log('   等待中的对话: ' + (queue.count || 0) + ' 个');
    if (queue.data && queue.data.length > 0) {
      queue.data.forEach(conv => {
        const name = conv.customer?.displayName || 'Unknown';
        const msg = conv.lastMessage?.content?.slice(0, 30) || 'N/A';
        console.log('   - ' + name + ': ' + msg + '...');
      });
    }

    // 3. 查看进行中的对话
    console.log('\n3️⃣ 查看进行中的对话...');
    const active = await getActiveConversations(token);
    console.log('   处理中的对话: ' + (active.count || 0) + ' 个');
    if (active.data && active.data.length > 0) {
      active.data.forEach(conv => {
        const name = conv.customer?.displayName || 'Unknown';
        console.log('   - ' + conv.id.slice(0, 8) + '... (' + name + ')');
      });
    }

    let testConversationId = null;

    // 如果有等待中的对话，接听一个来测试
    if (queue.data && queue.data.length > 0) {
      testConversationId = queue.data[0].id;
      console.log('\n4️⃣ 接听对话...');
      const acceptResult = await acceptConversation(token, testConversationId);
      console.log('   结果: ' + (acceptResult.success ? '✅ 成功' : '❌ 失败'));
      if (!acceptResult.success) {
        console.log('   错误: ' + acceptResult.message);
      }
    } else if (active.data && active.data.length > 0) {
      testConversationId = active.data[0].id;
      console.log('\n4️⃣ 使用现有进行中的对话进行测试');
      console.log('   对话 ID: ' + testConversationId);
    }

    if (testConversationId) {
      // 5. 取得对话讯息
      console.log('\n5️⃣ 取得对话讯息...');
      const messages = await getConversationMessages(token, testConversationId);
      console.log('   讯息数量: ' + (messages.pagination?.total || 0));
      if (messages.data && messages.data.length > 0) {
        console.log('   最近讯息:');
        messages.data.slice(-5).forEach(msg => {
          const sender = msg.senderType === 'CUSTOMER' ? '👤 客户' :
                        msg.senderType === 'AGENT' ? '💼 客服' : '🤖 AI';
          const content = msg.content || '';
          console.log('   ' + sender + ': ' + content.slice(0, 50) + (content.length > 50 ? '...' : ''));
        });
      }

      // 6. 取得 AI 推荐回覆
      console.log('\n6️⃣ 取得 AI 推荐回覆...');
      const suggestion = await getSuggestedReply(token, testConversationId);
      if (suggestion.success && suggestion.data?.suggestedReply) {
        console.log('   ✅ AI 推荐回覆:');
        console.log('   ┌' + '─'.repeat(56) + '┐');
        const lines = suggestion.data.suggestedReply.split('\n');
        lines.forEach(line => {
          // 处理每行，确保不超过边框
          if (line.length <= 54) {
            console.log('   │ ' + line.padEnd(54) + ' │');
          } else {
            // 长行分割
            for (let i = 0; i < line.length; i += 54) {
              const chunk = line.slice(i, i + 54);
              console.log('   │ ' + chunk.padEnd(54) + ' │');
            }
          }
        });
        console.log('   └' + '─'.repeat(56) + '┘');
        console.log('   来源: ' + (suggestion.data.cached ? '快取' : '即时生成'));
        if (suggestion.data.matchedFAQs?.length > 0) {
          console.log('   匹配 FAQ: ' + suggestion.data.matchedFAQs.length + ' 条');
        }
        console.log('   客户讯息: ' + (suggestion.data.customerMessage || 'N/A'));
      } else {
        console.log('   ⚠️ 无推荐回覆: ' + (suggestion.message || JSON.stringify(suggestion.data)));
      }

      // 7. 测试发送回覆 (可选)
      console.log('\n7️⃣ 测试发送回覆 (跳过，避免实际发送到 LINE)');

      // 8. 测试关闭对话 (可选)
      console.log('\n8️⃣ 测试关闭对话 (跳过，保持对话开启供后续测试)');

    } else {
      console.log('\n⚠️ 没有可测试的对话');
      console.log('   请先通过 LINE 发送讯息到官方帐号来创建对话');
      console.log('   或手动创建测试对话');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 测试完成！');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
  }
}

main();
