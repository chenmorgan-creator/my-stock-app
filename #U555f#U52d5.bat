@echo off
cd /d "%~dp0"

echo ================================================
echo   Starting website (pure frontend, no backend needed)
echo ================================================
echo.
echo Installing dependencies, this may take 1-2 minutes on first run...
call npm install
if errorlevel 1 (
    echo.
    echo npm install failed. Please make sure Node.js is installed:
    echo https://nodejs.org/
    pause
    exit /b
)

echo.
echo Starting the website, your browser should open automatically...
echo If not, open this address manually: http://localhost:5173
echo.
echo To stop the website, just close this black window.
echo ================================================

start "" http://localhost:5173
call npm run dev

pause
