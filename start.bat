@echo off
title Gemini Code Assistant

echo Installing dependencies...
call npm install

echo.
echo Starting the development server...
echo Visit http://localhost:5173 (or the address shown below) in your browser.
call npm run dev

echo.
echo Server has been stopped.
pause