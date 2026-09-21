@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
echo === 把 dsh-experience-plugin 挂进 DSH profile 组合 ===
node "scripts\profile-sync.mjs" apply
if errorlevel 1 exit /b 1
echo.
where dsh >nul 2>nul
if errorlevel 1 (
  echo [i] PATH 里没有 dsh，用 profile 自带的 dsh CLI 执行 pnpm install...
  node "%USERPROFILE%\.dsh\profiles\web\node_modules\@deepseek-ai\dsh\lib\bin.js" plugin --profile web install
) else (
  call dsh plugin --profile web install
)
echo.
echo === 完成。请关闭并重启 DSH Web（dsh web）让插件生效。 ===
node "scripts\profile-sync.mjs" status
pause
