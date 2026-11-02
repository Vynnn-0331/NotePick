@echo off
setlocal
cd /d "%~dp0"
set "NOTEPICK_NODE_EXE="
where node.exe >nul 2>nul
if not errorlevel 1 set "NOTEPICK_NODE_EXE=node.exe"
if not defined NOTEPICK_NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NOTEPICK_NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NOTEPICK_NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NOTEPICK_NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined NOTEPICK_NODE_EXE (
 echo Node.js is required. Install Node.js 22.12 or newer and reopen the terminal.
 exit /b 1
)
"%NOTEPICK_NODE_EXE%" -e "const [m,n]=process.versions.node.split('.').map(Number);if(m<22||(m===22&&n<12)){console.error('Node.js 22.12+ is required.');process.exit(1)}"
if errorlevel 1 exit /b 1
"%NOTEPICK_NODE_EXE%" scripts\dev.mjs
exit /b %errorlevel%
