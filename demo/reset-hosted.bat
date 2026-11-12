@echo off
rem Reset the DEMO data on the hosted demo: accounts, the one-seat contest (empty again),
rem the integrity fixture, and anything DEMO Setter or DEMO Organiser made in a rehearsal.
rem   reset-hosted.bat                  reset
rem   reset-hosted.bat forget EMAIL     delete one account (the one you sign up live) so it can sign up again
setlocal
set KEY=%USERPROFILE%\.ssh\codeclash_oracle
set HOST=ubuntu@129.225.92.29
if not exist "%KEY%" (echo SSH key not found: %KEY% & pause & exit /b 1)

if /i "%~1"=="forget" (
  if "%~2"=="" (echo usage: reset-hosted.bat forget you@example.com & pause & exit /b 1)
  ssh -i "%KEY%" %HOST% "cd /opt/codeclash/server && sudo node dist/demo.js --forget %~2"
) else (
  ssh -i "%KEY%" %HOST% "cd /opt/codeclash/server && sudo node dist/demo.js"
)
echo.
pause
