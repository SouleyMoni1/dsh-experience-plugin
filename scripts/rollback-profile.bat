@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
echo === 从 DSH profile 组合摘掉 dsh-experience-plugin ===
node "scripts\profile-sync.mjs" rollback
if errorlevel 1 exit /b 1
echo.
where dsh >nul 2>nul
if errorlevel 1 (
  node "%USERPROFILE%\.dsh\profiles\web\node_modules\@deepseek-ai\dsh\lib\bin.js" plugin --profile web install
) else (
  call dsh plugin --profile web install
)
echo.
echo === 完成。请重启 DSH Web。 ===
pause
