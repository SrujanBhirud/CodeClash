@echo off
rem After the hydra attack: show that nothing it started is still alive on the host.
setlocal
set KEY=%USERPROFILE%\.ssh\codeclash_oracle
set HOST=ubuntu@129.225.92.29
ssh -i "%KEY%" %HOST% "echo '--- sandbox containers still running (should be none):'; docker ps --filter name=cc-run --format '{{.Names}}  {{.RunningFor}}' 2>/dev/null || sudo docker ps --filter name=cc-run --format '{{.Names}}  {{.RunningFor}}'; echo '--- processes owned by the sandbox user 65534 (should be none):'; ps -u 65534 -o pid=,etime=,cmd= || echo none; echo '--- host load and memory:'; uptime; free -m | head -2; echo '--- services:'; systemctl is-active codeclash-server codeclash-judge codeclash-agent"
echo.
pause
