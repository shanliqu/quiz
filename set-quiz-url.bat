@echo off
chcp 65001 >nul
title 扫码答题 - 指定二维码地址
cd /d "%~dp0"

echo.
echo   ==================================================
echo     指定二维码里写死的访问地址
echo   ==================================================
echo.
echo   说明：如果你有公网域名/固定IP，用这个启动，
echo         二维码里就会固定写死该地址，不随网卡变化。
echo.
echo   示例：set-quiz-url.bat https://myquiz.pages.dev/
echo.

set /p URL=请输入要写入二维码的完整地址（含 http:// 或 https://）: 

if "%URL%"=="" (
  echo.
  echo   [!] 未输入地址，退出。
  pause
  exit /b 1
)

echo.
echo   正在以固定地址启动：%URL%
echo.

set QUIZ_URL=%URL%
node server.js

echo.
pause
