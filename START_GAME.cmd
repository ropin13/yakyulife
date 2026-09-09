@echo off
setlocal EnableExtensions
title YaKyoLife Offline Launcher
cd /d "%~dp0"

echo YaKyoLife Career Expansion Launcher v0.30.0
echo Folder: %CD%
echo.

set "YAKYO_PY="
if exist "%SystemRoot%\py.exe" set "YAKYO_PY=%SystemRoot%\py.exe"
if not defined YAKYO_PY if exist "%LocalAppData%\Programs\Python\Python38\python.exe" set "YAKYO_PY=%LocalAppData%\Programs\Python\Python38\python.exe"
if not defined YAKYO_PY if exist "%LocalAppData%\Programs\Python\Python39\python.exe" set "YAKYO_PY=%LocalAppData%\Programs\Python\Python39\python.exe"
if not defined YAKYO_PY if exist "%LocalAppData%\Programs\Python\Python310\python.exe" set "YAKYO_PY=%LocalAppData%\Programs\Python\Python310\python.exe"
if not defined YAKYO_PY if exist "%LocalAppData%\Programs\Python\Python311\python.exe" set "YAKYO_PY=%LocalAppData%\Programs\Python\Python311\python.exe"
if not defined YAKYO_PY if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "YAKYO_PY=%LocalAppData%\Programs\Python\Python312\python.exe"
if not defined YAKYO_PY if exist "%ProgramFiles%\Python38\python.exe" set "YAKYO_PY=%ProgramFiles%\Python38\python.exe"
if not defined YAKYO_PY for /f "delims=" %%P in ('where python.exe 2^>nul') do if not defined YAKYO_PY set "YAKYO_PY=%%P"

if not defined YAKYO_PY goto NO_PYTHON
echo Python: %YAKYO_PY%
echo Starting local game server...
start "YaKyoLife v0.30.0 Server - keep this window open" /D "%~dp0" "%YAKYO_PY%" server.py
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:8881/index.html?build=0.30.0"
echo.
echo The browser should now open the game.
echo If it does not, open: http://127.0.0.1:8881/index.html?build=0.30.0
echo You may close THIS launcher window, but keep the SERVER window open.
echo.
pause
exit /b 0

:NO_PYTHON
echo ERROR: Python 3 was not found.
echo Try opening Command Prompt in this folder and run:
echo   py -3 -m http.server 8881
echo Then open http://127.0.0.1:8881/index.html?build=0.30.0
echo.
pause
exit /b 1
