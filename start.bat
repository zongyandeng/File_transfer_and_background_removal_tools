@echo off
:: 設定字元集為 UTF-8 以免中文亂碼
chcp 65001 >nul
title iDeer 照片去背與 WebP 轉檔工具 - 本地伺服器啟動器

echo ======================================================================
echo             iDeer 照片去背與 WebP 轉檔工具 (一鍵啟動器)
echo ======================================================================
echo.
echo 說明：
echo 由於本工具採用了先進的前端 AI 技術 (WebAssembly 與 Web Worker)，
echo 受限於瀏覽器安全防護政策 (CORS)，無法直接雙擊 index.html 運行。
echo 我們將為您自動尋找並啟動一個輕量級的本地 HTTP 伺服器，
echo 啟動後會自動為您開啟瀏覽器頁面。
echo.
echo ----------------------------------------------------------------------
echo 正在檢測您的本機環境...
echo.

:: 1. 優先檢測並使用 Node.js / npx
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [環境偵測] 偵測到 Node.js 環境！
    echo 正在透過 npx 啟動 http-server (埠號 8080)...
    echo.
    :: 在背景自動開啟網頁
    start "" "http://localhost:8080"
    :: 啟動輕量伺服器
    npx -y http-server -p 8080
    goto end
)

:: 2. 備用檢測並使用 Python
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [環境偵測] 偵測到 Python 環境！
    echo 正在啟動 python -m http.server (埠號 8000)...
    echo.
    :: 在背景自動開啟網頁
    start "" "http://localhost:8000"
    :: 啟動 Python 內建 HTTP 伺服器
    python -m http.server 8000
    goto end
)

:: 3. 兩者皆無時的警告與教學
echo ======================================================================
echo ❌ [啟動失敗] 您的系統上未偵測到 Node.js 或 Python！
echo ======================================================================
echo.
echo 因為沒有本地伺服器，直接用瀏覽器雙擊 index.html 會因為安全性 CORS 政策
echo 導致 JavaScript 無法加載，致使點擊所有 UI 按鈕皆無反應。
echo.
echo 💡 建議的解決方案：
echo 1. 若您有安裝 VS Code，請在 index.html 右鍵點選「Open with Live Server」。
echo 2. 安裝 Node.js (https://nodejs.org) 後，直接雙擊此 start.bat 檔案即可一鍵啟動。
echo.
pause

:end
