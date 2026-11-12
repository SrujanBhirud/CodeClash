@echo off
rem Scripted one-seat race. Creates "DEMO Concurrency race" and leaves "DEMO One seat" alone.
rem   concurrency.bat                         race on the hosted demo, then show the hand-off
rem   concurrency.bat --hold                  leave the winner seated
rem   concurrency.bat --url http://127.0.0.1:4000
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not on PATH.
  pause
  exit /b 1
)
chcp 65001 >nul
node concurrency.mjs %*
set CODE=%ERRORLEVEL%
echo.
pause
exit /b %CODE%
