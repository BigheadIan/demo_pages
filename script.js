// 應用狀態
let currentCustomerId = null;
let filteredCustomers = customers;

// 初始化
function init() {
    renderCustomerList();
    setupEventListeners();
    loadTemplates();
    initTabs();
}

// 渲染客戶列表
function renderCustomerList() {
    const customerItems = document.getElementById('customerItems');
    customerItems.innerHTML = '';
    
    filteredCustomers.forEach(customer => {
        const item = document.createElement('div');
        item.className = 'customer-item';
        item.dataset.customerId = customer.id;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = customer.avatar;
        
        const customerInfo = document.createElement('div');
        customerInfo.className = 'customer-info';
        
        const name = document.createElement('h4');
        name.textContent = customer.name;
        
        const meta = document.createElement('div');
        meta.className = 'customer-meta';
        
        const badge = document.createElement('span');
        badge.className = `source-badge ${customer.source}`;
        badge.textContent = customer.source;
        
        const time = document.createElement('span');
        time.className = 'last-time';
        time.textContent = customer.lastTime;
        
        meta.appendChild(badge);
        meta.appendChild(time);
        
        const lastMsg = document.createElement('div');
        lastMsg.className = 'last-message';
        lastMsg.textContent = customer.lastMessage;
        
        customerInfo.appendChild(name);
        customerInfo.appendChild(meta);
        customerInfo.appendChild(lastMsg);
        
        item.appendChild(avatar);
        item.appendChild(customerInfo);
        
        item.addEventListener('click', () => selectCustomer(customer.id));
        
        customerItems.appendChild(item);
    });
}

// 選擇客戶
function selectCustomer(customerId) {
    currentCustomerId = customerId;
    
    // 更新客戶列表的活動狀態
    document.querySelectorAll('.customer-item').forEach(item => {
        if (item.dataset.customerId === String(customerId)) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // 找到客戶數據
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    // 更新對話區頭部
    const chatName = document.getElementById('chatName');
    const chatCompany = document.getElementById('chatCompany');
    const chatAvatar = document.getElementById('chatAvatar');
    chatName.textContent = customer.name;
    chatCompany.textContent = `${customer.company} • ${customer.source}`;
    chatAvatar.textContent = customer.avatar;
    
    // 更新狀態
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    statusDot.className = `status-dot ${customer.status}`;
    statusText.textContent = customer.status === 'online' ? '線上' : 
                            customer.status === 'away' ? '離開' : '離線';
    
    // 渲染對話
    renderMessages(customer.messages);
}

// 渲染對話訊息
function renderMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    
    messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.type}`;
        
        // 根據訊息類型創建不同內容
        if (msg.fileType === 'file') {
            // 檔案訊息
            const fileDiv = document.createElement('div');
            fileDiv.className = 'message-file';
            
            const fileContent = document.createElement('div');
            fileContent.className = 'message-file-content';
            
            const fileIcon = document.createElement('div');
            fileIcon.className = 'file-icon';
            fileIcon.textContent = '📎';
            
            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';
            
            const fileName = document.createElement('h5');
            fileName.textContent = msg.fileName || '附件檔案';
            
            const fileSize = document.createElement('p');
            fileSize.textContent = msg.fileSize || '未知大小';
            
            fileInfo.appendChild(fileName);
            fileInfo.appendChild(fileSize);
            
            fileContent.appendChild(fileIcon);
            fileContent.appendChild(fileInfo);
            fileDiv.appendChild(fileContent);
            messageDiv.appendChild(fileDiv);
        } else if (msg.fileType === 'photo') {
            // 照片訊息
            const photoDiv = document.createElement('div');
            photoDiv.className = 'message-photo';
            
            const photoContent = document.createElement('div');
            photoContent.className = 'message-photo-content';
            
            const img = document.createElement('img');
            img.src = msg.photoUrl || 'https://via.placeholder.com/200x200';
            img.alt = '照片';
            
            photoContent.appendChild(img);
            photoDiv.appendChild(photoContent);
            messageDiv.appendChild(photoDiv);
        } else {
            // 一般文字訊息
            const content = document.createElement('div');
            content.className = 'message-content';
            content.textContent = msg.text;
            messageDiv.appendChild(content);
        }
        
        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = msg.time;
        
        messageDiv.appendChild(time);
        chatMessages.appendChild(messageDiv);
    });
    
    // 滾動到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 設置事件監聽器
function setupEventListeners() {
    // 客戶搜尋
    const customerSearch = document.getElementById('customerSearch');
    customerSearch.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase();
        filteredCustomers = customers.filter(customer => 
            customer.name.toLowerCase().includes(keyword) ||
            customer.company.toLowerCase().includes(keyword) ||
            customer.source.toLowerCase().includes(keyword)
        );
        renderCustomerList();
    });
    
    // 發送訊息
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 工具按鈕
    const emojiBtn = document.getElementById('emojiBtn');
    const templateBtn = document.getElementById('templateBtn');
    const fileBtn = document.getElementById('fileBtn');
    const photoBtn = document.getElementById('photoBtn');
    const screenshotBtn = document.getElementById('screenshotBtn');
    
    emojiBtn.addEventListener('click', toggleEmojiPicker);
    templateBtn.addEventListener('click', toggleTemplatePicker);
    
    // 檔案上傳
    fileBtn.addEventListener('click', () => {
        const fileInput = document.getElementById('fileInput');
        fileInput.click();
    });
    
    // 照片上傳
    photoBtn.addEventListener('click', () => {
        const photoInput = document.getElementById('photoInput');
        photoInput.click();
    });
    
    // 截圖功能
    screenshotBtn.addEventListener('click', startScreenshot);
    
    // 檔案選擇事件
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
        }
    });
    
    // 照片選擇事件
    const photoInput = document.getElementById('photoInput');
    photoInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handlePhotoUpload(e.target.files[0]);
        }
    });
    
    // 查詢按鈕
    document.querySelectorAll('.query-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleQuery(e.target.dataset.service));
    });
    
    // 點擊外部關閉選擇器
    const emojiPicker = document.getElementById('emojiPicker');
    const templatePicker = document.getElementById('templatePicker');
    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn && !emojiBtn.contains(e.target)) {
            emojiPicker.classList.remove('show');
        }
        if (!templatePicker.contains(e.target) && e.target !== templateBtn && !templateBtn.contains(e.target)) {
            templatePicker.classList.remove('show');
        }
    });
}

// 初始化 TAB 切換
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const queryResultsEl = document.getElementById('queryResults');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            // 更新按鈕狀態
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 更新表單顯示
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabName}-form`).classList.add('active');
            
            // 清空查詢結果，避免不同 TAB 的結果混淆
            queryResultsEl.innerHTML = '<div class="empty-state"><p>點擊「查詢」開始搜尋</p></div>';
        });
    });
}

// 發送訊息
function sendMessage() {
    if (!currentCustomerId) {
        alert('請先選擇客戶');
        return;
    }
    
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    if (!text) return;
    
    // 創建新訊息
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message agent';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;
    
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = timeStr;
    
    messageDiv.appendChild(content);
    messageDiv.appendChild(time);
    chatMessages.appendChild(messageDiv);
    
    // 清空輸入框
    messageInput.value = '';
    
    // 滾動到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // 模擬客戶回覆（1秒後）
    setTimeout(() => {
        const autoReplies = [
            '好的，了解',
            '感謝您的協助',
            '沒有問題',
            '再麻煩您了',
            '好的，謝謝',
            '了解，感恩'
        ];
        const reply = autoReplies[Math.floor(Math.random() * autoReplies.length)];
        
        const customerMsg = document.createElement('div');
        customerMsg.className = 'message customer';
        
        const content2 = document.createElement('div');
        content2.className = 'message-content';
        content2.textContent = reply;
        
        const time2 = document.createElement('div');
        time2.className = 'message-time';
        time2.textContent = `${String(now.getHours()).padStart(2, '0')}:${String((now.getMinutes() + 1) % 60).padStart(2, '0')}`;
        
        customerMsg.appendChild(content2);
        customerMsg.appendChild(time2);
        chatMessages.appendChild(customerMsg);
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // 更新客戶列表的最後訊息
        updateCustomerLastMessage(currentCustomerId, reply);
    }, 1000);
}

// 更新客戶列表的最後訊息
function updateCustomerLastMessage(customerId, message) {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
        customer.lastMessage = message;
        const now = new Date();
        customer.lastTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        renderCustomerList();
        // 重新標記活動客戶
        selectCustomer(customerId);
    }
}

// 切換表情符號選擇器
function toggleEmojiPicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    const templatePicker = document.getElementById('templatePicker');
    emojiPicker.classList.toggle('show');
    templatePicker.classList.remove('show');
}

// 切換罐頭訊息選擇器
function toggleTemplatePicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    const templatePicker = document.getElementById('templatePicker');
    templatePicker.classList.toggle('show');
    emojiPicker.classList.remove('show');
}

// 載入罐頭訊息
function loadTemplates() {
    const templateList = document.getElementById('templateList');
    templates.forEach(template => {
        const item = document.createElement('div');
        item.className = 'template-item';
        item.textContent = template.text;
        item.addEventListener('click', () => {
            const messageInput = document.getElementById('messageInput');
            messageInput.value = template.text;
            const templatePicker = document.getElementById('templatePicker');
            templatePicker.classList.remove('show');
        });
        templateList.appendChild(item);
    });
}

// 表情符號點擊事件
document.querySelectorAll('.emoji-item').forEach(item => {
    item.addEventListener('click', () => {
        const messageInput = document.getElementById('messageInput');
        const emojiPicker = document.getElementById('emojiPicker');
        messageInput.value += item.textContent;
        emojiPicker.classList.remove('show');
        messageInput.focus();
    });
});

// 處理查詢
function handleQuery(serviceType) {
    const queryResultsEl = document.getElementById('queryResults');
    
    // 直接從 data.js 中的 queryResults 對象獲取對應服務類型的結果
    let results = [];
    
    if (serviceType === 'flight') {
        results = queryResults.flight || [];
    } else if (serviceType === 'hotel') {
        results = queryResults.hotel || [];
    } else if (serviceType === 'railway') {
        results = queryResults.railway || [];
    } else if (serviceType === 'transfer') {
        results = queryResults.transfer || [];
    } else if (serviceType === 'rental') {
        results = queryResults.rental || [];
    }
    
    if (!results || results.length === 0) {
        queryResultsEl.innerHTML = '<div class="empty-state"><p>沒有找到符合的結果</p></div>';
        return;
    }
    
    // 清空並顯示結果
    queryResultsEl.innerHTML = '';
    
    results.forEach(result => {
        const card = document.createElement('div');
        card.className = 'result-card';
        
        const title = document.createElement('h4');
        title.textContent = result.name;
        
        const price = document.createElement('div');
        price.className = 'price';
        price.textContent = result.price;
        
        card.appendChild(title);
        card.appendChild(price);
        
        // 添加詳細信息
        const details = document.createElement('div');
        details.className = 'details';
        let detailText = '';
        
        if (result.period) detailText = `期間：${result.period}`;
        else if (result.airline) detailText = `航空公司：${result.airline}`;
        else if (result.location) detailText = `位置：${result.location}`;
        else if (result.rating) detailText = `評分：${result.rating}`;
        else if (result.duration) detailText = `天數：${result.duration}`;
        else if (result.cover) detailText = `範圍：${result.cover}`;
        else if (result.capacity) detailText = `容量：${result.capacity}`;
        else if (result.provider) detailText = `服務商：${result.provider}`;
        
        if (detailText) {
            details.textContent = detailText;
            card.appendChild(details);
        }
        
        const insertBtn = document.createElement('button');
        insertBtn.className = 'insert-btn';
        insertBtn.textContent = '插入對話';
        insertBtn.addEventListener('click', () => {
            if (currentCustomerId) {
                const info = `${result.name} - ${result.price}`;
                const messageInput = document.getElementById('messageInput');
                messageInput.value = info;
            } else {
                showAlert('請先選擇客戶');
            }
        });
        
        card.appendChild(insertBtn);
        queryResultsEl.appendChild(card);
    });
}

// 顯示提示
function showAlert(message) {
    alert(message);
}

// 處理檔案上傳
function handleFileUpload(file) {
    if (!currentCustomerId) {
        alert('請先選擇客戶');
        return;
    }
    
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message agent';
    
    // 創建檔案訊息
    const fileDiv = document.createElement('div');
    fileDiv.className = 'message-file';
    
    const fileContent = document.createElement('div');
    fileContent.className = 'message-file-content';
    
    const fileIcon = document.createElement('div');
    fileIcon.className = 'file-icon';
    fileIcon.textContent = '📎';
    
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    
    const fileName = document.createElement('h5');
    fileName.textContent = file.name;
    
    const fileSize = document.createElement('p');
    const size = (file.size / 1024).toFixed(2);
    fileSize.textContent = `${size} KB`;
    
    fileInfo.appendChild(fileName);
    fileInfo.appendChild(fileSize);
    
    fileContent.appendChild(fileIcon);
    fileContent.appendChild(fileInfo);
    fileDiv.appendChild(fileContent);
    messageDiv.appendChild(fileDiv);
    
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = timeStr;
    messageDiv.appendChild(time);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // 清空檔案輸入
    document.getElementById('fileInput').value = '';
}

// 處理照片上傳
function handlePhotoUpload(file) {
    if (!currentCustomerId) {
        alert('請先選擇客戶');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message agent';
        
        // 創建照片訊息
        const photoDiv = document.createElement('div');
        photoDiv.className = 'message-photo';
        
        const photoContent = document.createElement('div');
        photoContent.className = 'message-photo-content';
        
        const img = document.createElement('img');
        img.src = e.target.result;
        img.alt = '照片';
        
        photoContent.appendChild(img);
        photoDiv.appendChild(photoContent);
        messageDiv.appendChild(photoDiv);
        
        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = timeStr;
        messageDiv.appendChild(time);
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };
    
    reader.readAsDataURL(file);
    
    // 清空照片輸入
    document.getElementById('photoInput').value = '';
}

// 截圖功能
let isSelecting = false;
let startX, startY, endX, endY;
let overlay = null;

function startScreenshot() {
    if (!currentCustomerId) {
        alert('請先選擇客戶');
        return;
    }
    
    // 創建全屏遮罩
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '9999';
    overlay.style.cursor = 'crosshair';
    overlay.id = 'screenshot-overlay';
    
    const instructions = document.createElement('div');
    instructions.style.position = 'absolute';
    instructions.style.top = '20px';
    instructions.style.left = '50%';
    instructions.style.transform = 'translateX(-50%)';
    instructions.style.color = 'white';
    instructions.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    instructions.style.padding = '10px 20px';
    instructions.style.borderRadius = '8px';
    instructions.style.fontSize = '14px';
    instructions.style.zIndex = '10000';
    instructions.textContent = '按住滑鼠拖曳選擇區域，完成後放開滑鼠';
    
    overlay.appendChild(instructions);
    document.body.appendChild(overlay);
    
    let selection = null;
    
    overlay.addEventListener('mousedown', (e) => {
        isSelecting = true;
        startX = e.clientX;
        startY = e.clientY;
        
        // 創建選擇框
        selection = document.createElement('div');
        selection.style.position = 'fixed';
        selection.style.border = '2px dashed #fff';
        selection.style.backgroundColor = 'transparent';
        selection.style.pointerEvents = 'none';
        selection.style.zIndex = '10000';
        document.body.appendChild(selection);
        
        e.preventDefault();
    });
    
    overlay.addEventListener('mousemove', (e) => {
        if (isSelecting && selection) {
            endX = e.clientX;
            endY = e.clientY;
            
            const left = Math.min(startX, endX);
            const top = Math.min(startY, endY);
            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);
            
            selection.style.left = left + 'px';
            selection.style.top = top + 'px';
            selection.style.width = width + 'px';
            selection.style.height = height + 'px';
        }
    });
    
    overlay.addEventListener('mouseup', (e) => {
        if (isSelecting && selection) {
            isSelecting = false;
            
            const left = Math.min(startX, endX);
            const top = Math.min(startY, endY);
            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);
            
            // 移除遮罩和選擇框
            document.body.removeChild(overlay);
            document.body.removeChild(selection);
            
            // 捕獲截圖
            captureScreenshot(left, top, width, height);
        }
    });
}

function captureScreenshot(x, y, width, height) {
    // 創建 canvas 來繪製截圖
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // 模擬截圖（因為瀏覽器限制，實際無法截取其他內容）
    // 我們用一個模擬的圖像來代替
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('截圖區域', width / 2, height / 2);
    
    const timestamp = new Date().toLocaleString();
    ctx.font = '12px Arial';
    ctx.fillText(timestamp, width / 2, height / 2 + 25);
    
    const screenshotUrl = canvas.toDataURL('image/png');
    
    // 發送截圖到對話
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message agent';
    
    const photoDiv = document.createElement('div');
    photoDiv.className = 'message-photo';
    
    const photoContent = document.createElement('div');
    photoContent.className = 'message-photo-content';
    
    const img = document.createElement('img');
    img.src = screenshotUrl;
    img.alt = '截圖';
    
    photoContent.appendChild(img);
    photoDiv.appendChild(photoContent);
    messageDiv.appendChild(photoDiv);
    
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = timeStr;
    messageDiv.appendChild(time);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 啟動應用
init();
