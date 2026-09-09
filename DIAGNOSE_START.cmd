@echo off
setlocal
cd /d "%~dp0"
set "OUT=%~dp0START_DIAGNOSIS.txt"
(
echo YaKyoLife start diagnosis
echo DATE: %DATE% %TIME%
echo FOLDER: %CD%
echo COMSPEC: %ComSpec%
echo SYSTEMROOT: %SystemRoot%
echo LOCALAPPDATA: %LocalAppData%
echo.
echo --- WHERE PY ---
where py.exe 2^>^&1
echo.
echo --- WHERE PYTHON ---
where python.exe 2^>^&1
echo.
echo --- PY VERSION ---
py -3 --version 2^>^&1
echo.
echo --- PYTHON VERSION ---
python --version 2^>^&1
echo.
echo --- PORT 8881 ---
netstat -ano ^| findstr ":8881"
) > "%OUT%" 2>&1
echo Diagnosis saved to:
echo %OUT%
echo.
type "%OUT%"
echo.
pause
