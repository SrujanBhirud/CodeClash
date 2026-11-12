@echo off
rem Fallback if the hosted demo is down: the whole stack on this PC.
rem   run-local.bat          start Mongo, Redis and Mailpit, reset the DEMO data, start the app, open the browser
rem   run-local.bat seed     the same, but first load the full seed (only needed on an empty database)
setlocal
cd /d "%~dp0.."

where docker >nul 2>nul || (echo Docker Desktop is not installed or not on PATH. & goto :fail)
docker info >nul 2>nul || (echo Start Docker Desktop first, then run this again. & goto :fail)

echo [1/5] Mongo, Redis and Mailpit (compose project codeclash-srujan)
docker compose -p codeclash-srujan up -d mongo mongo-init redis mailpit || goto :fail

echo [2/5] Waiting for the Mongo replica set
set tries=0
:waitmongo
set /a tries+=1
docker compose -p codeclash-srujan exec -T mongo mongosh --quiet -u root -p codeclash --authenticationDatabase admin --eval "quit(db.hello().isWritablePrimary ? 0 : 1)" >nul 2>nul && goto :mongoready
if %tries% geq 60 (echo Mongo did not become primary. & goto :fail)
timeout /t 2 /nobreak >nul
goto :waitmongo
:mongoready

if /i "%~1"=="seed" (
  echo [3/5] Loading the full seed
  call npm run seed || goto :fail
) else (
  echo [3/5] Skipping the full seed. Run "run-local.bat seed" on an empty database.
)

echo [4/5] DEMO accounts, the one-seat contest and the integrity fixture
call npm run build -w packages/shared >nul || goto :fail
call npm run demo -w server || goto :fail

echo [5/5] Starting server, judge, agent and client in a new window
start "CodeClash dev" cmd /k "cd /d %cd% && npm run dev"

set tries=0
:waitapi
set /a tries+=1
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:4000/health; exit [int]($r.StatusCode -ne 200) } catch { exit 1 }" && goto :apiready
if %tries% geq 90 (echo The API did not answer on port 4000. Check the "CodeClash dev" window. & goto :fail)
timeout /t 2 /nobreak >nul
goto :waitapi
:apiready

start "" http://127.0.0.1:5173/
start "" http://127.0.0.1:8025/
echo.
echo Ready. App: http://127.0.0.1:5173   Mail inbox (Mailpit): http://127.0.0.1:8025
echo Seat race against this PC:  node demo\race.mjs --url http://127.0.0.1:4000
echo Sign-in emails go to Mailpit here, not to a real inbox.
goto :eof

:fail
echo.
echo Local start failed.
pause
exit /b 1
