@echo off
chcp 65001 > nul

echo.
echo [ Kayan Sync Service Uninstaller ]
echo ----------------------------------
echo.
echo :: Uninstalling 'KayanSyncService' Windows Service...
call node "%~dp0uninstall-service.js"
echo.
echo :: Service uninstallation command sent.
echo.
exit /b 0