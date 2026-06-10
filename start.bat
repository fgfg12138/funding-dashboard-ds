@echo off
REM ============================================================
REM  Funding Dashboard — Windows Quick Start
REM  Uses cmd.exe to bypass PowerShell execution policy.
REM ============================================================
title Funding Dashboard

REM ── Step 1: Install dependencies ──
if not exist "node_modules\" (
    echo [1/2] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo [91mERROR: npm install failed. Check your network connection.[0m
        pause
        exit /b 1
    )
) else (
    echo [1/2] Dependencies already installed.
)

REM ── Step 2: Start dev server ──
echo [2/2] Starting development server...
echo.
echo   Open http://localhost:3000 in your browser
echo   Press Ctrl+C to stop
echo.
call npm run dev

pause
