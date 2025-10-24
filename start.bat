@echo off
TITLE Gemini Code Assistant

echo ===================================
echo  Installing project dependencies...
echo ===================================
call npm install

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install dependencies.
    echo Please check your Node.js and npm installation.
    pause
    exit /b %errorlevel%
)

echo.
echo ===================================
echo  Starting the development server...
echo ===================================
call npm run dev

pause