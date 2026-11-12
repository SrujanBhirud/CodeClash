@echo off
rem Failure demo on the hosted VM: stop the judge, submit, then start it and watch the verdict arrive.
rem   judge.bat stop      the judge goes away; new submissions wait in the Redis stream
rem   judge.bat start     the judge comes back and drains the queue
rem   judge.bat status    service state and the last judge log lines
setlocal
set KEY=%USERPROFILE%\.ssh\codeclash_oracle
set HOST=ubuntu@129.225.92.29
if not exist "%KEY%" (echo SSH key not found: %KEY% & pause & exit /b 1)
if /i "%~1"=="stop" (
  ssh -i "%KEY%" %HOST% "sudo systemctl stop codeclash-judge; systemctl is-active codeclash-judge; curl -s http://127.0.0.1:4000/health"
) else if /i "%~1"=="start" (
  ssh -i "%KEY%" %HOST% "sudo systemctl start codeclash-judge; sleep 3; systemctl is-active codeclash-judge; sudo journalctl -u codeclash-judge -n 6 --no-pager -o cat"
) else (
  ssh -i "%KEY%" %HOST% "systemctl is-active codeclash-server codeclash-judge codeclash-agent; curl -s http://127.0.0.1:4000/health; echo; sudo journalctl -u codeclash-judge -n 6 --no-pager -o cat"
)
echo.
pause
