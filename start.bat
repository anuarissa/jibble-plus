@echo off
REM ===============================================
REM Jibble+ App — arranque de un click
REM Doble click sobre este archivo y se abren backend + frontend + navegador
REM ===============================================

echo.
echo  Iniciando Jibble+ App...
echo.

REM Backend en ventana separada (puerto 3010)
start "Jibble+ Backend (puerto 3010)" cmd /k "cd /d %~dp0backend && node server.js"

REM Frontend en otra ventana (puerto 3000)
start "Jibble+ Frontend (puerto 3000)" cmd /k "cd /d %~dp0frontend && set BACKEND_URL=http://localhost:3010 && npm run dev"

REM Esperar a que el frontend levante y abrir navegador
echo Esperando 6 segundos a que el frontend este listo...
timeout /t 6 /nobreak >nul

start "" "http://localhost:3000"

echo.
echo  Listo. La app deberia abrirse en tu navegador.
echo  Para detenerla: cierra las dos ventanas que se abrieron.
echo.
pause
