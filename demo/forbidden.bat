@echo off
rem DEMO Student tries staff routes and a forged admin token; every one should be refused.
rem   forbidden.bat                              against the hosted demo
rem   forbidden.bat --url http://127.0.0.1:4000  against this PC
cd /d "%~dp0"
node forbidden.mjs %*
echo.
pause
