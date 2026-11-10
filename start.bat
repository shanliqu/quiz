@echo off
chcp 65001 >nul
title 扫码答题 - 唯一二维码入口
cd /d "%~dp0"

echo.
echo   ==================================================
echo     扫码答题 - 一键启动
echo   ==================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo   [!] 未检测到 Node.js，正在尝试使用 Python 启动...
  where python >nul 2>nul
  if %errorlevel% neq 0 (
    echo.
    echo   [!] 未检测到 Node.js 和 Python
    echo       请安装 Node.js ^(https://nodejs.org/^) 或 Python ^(https://www.python.org/^)
    echo.
    pause
    exit /b 1
  )
  python server.py
  goto :end
)

if not exist node_modules (
  echo   首次运行，正在安装依赖...
  call npm install --no-audit --no-fund
)

echo.
echo   启动中，请保持本窗口开启（关闭窗口即停止服务）。
echo.
echo   大屏二维码: http://localhost:8080/cast.html
echo   自检页面  : http://localhost:8080/selfcheck.html
echo.
start "" "http://localhost:8080/selfcheck.html"

node server.js

:end
echo.
echo   服务已停止。
pause
