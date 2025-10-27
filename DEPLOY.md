# GitHub Pages 部署說明

## 已在 GitHub 上建立專案

專案已經成功推送到：`git@github.com:BigheadIan/demo_pages.git`

## 如何啟用 GitHub Pages

1. **訪問 GitHub 倉庫**
   - 打開瀏覽器，前往：https://github.com/BigheadIan/demo_pages

2. **進入設定頁面**
   - 點擊倉庫右上角的 "Settings"（設定）

3. **開啟 GitHub Pages**
   - 在左側選單中找到 "Pages"（頁面）
   - 在 "Source"（來源）區域，選擇：
     - Branch: `main`
     - Folder: `/ (root)`

4. **儲存設定**
   - 點擊 "Save"（儲存）按鈕

5. **等待部署**
   - GitHub 會自動開始部署
   - 幾分鐘後，您的網站就可以通過以下網址訪問：
     - **https://bigheadian.github.io/demo_pages/**
     - 或 **https://bigheadian.github.io/demo_pages/index.html**

## 預覽網址

部署完成後，您可以在任何地方通過以下網址訪問您的客服工作台：

```
https://bigheadian.github.io/demo_pages/
```

## 更新網站內容

如果您修改了代碼並想更新網站：

```bash
cd "/Users/BigheadIan/Desktop/travel agency"
git add .
git commit -m "更新內容描述"
git push
```

GitHub Pages 會自動重新部署（可能需要幾分鐘時間）。

## 注意事項

- 網站的訪問網址是公開的，任何人都可以訪問
- 修改後推送，GitHub Pages 會自動更新（可能需要幾分鐘）
- 免費方案的網站訪問速度可能較慢，屬於正常現象

