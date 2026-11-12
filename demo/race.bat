@echo off
rem The scripted race is concurrency.bat. It uses "DEMO Concurrency race", not "DEMO One seat".
cd /d "%~dp0"
call concurrency.bat %*
