@echo off
chcp 65001 > nul

echo.
echo [ Kayan Sync Service Installer ]
echo ---------------------------------
echo.

:: الخطوة 1: الانتقال إلى دليل السكربت لضمان صحة جميع المسارات
cd /d "%~dp0"

:: *** هذا هو الحل الحاسم: إنشاء مجلد السجلات قبل استخدامه ***
echo :: Creating log directory...
mkdir logs

echo :: Step 2 of 3: Installing required libraries in '%cd%'...
call npm install --omit=dev
if %errorlevel% neq 0 (
    echo.
    echo *****************************************************************
    echo !! ERROR: Failed to install required libraries.
    echo *****************************************************************
    echo.
    pause
    exit /b 1
)
echo :: Libraries installed successfully.
echo.

echo :: Step 3 of 3: Installing and starting the Windows Service...
call node install-service.js
if %errorlevel% neq 0 (
    echo.
    echo *****************************************************************
    echo !! ERROR: Failed to install the Windows Service.
    echo *****************************************************************
    echo.
    pause
    exit /b 1
)
echo :: Service 'KayanSyncService' installed and started successfully.
echo.

echo ---------------------------------
echo Setup tasks completed.
echo.
exit /b 0