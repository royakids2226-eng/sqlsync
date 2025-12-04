param(
    [Parameter(Mandatory=$true)]
    [string]$OutputPath,
    
    [Parameter(Mandatory=$true)]
    [string]$DbServer,
    
    [Parameter(Mandatory=$true)]
    [string]$DbDatabase,
    
    [Parameter(Mandatory=$true)]
    [string]$DbUser,
    
    [Parameter(Mandatory=$true)]
    [string]$DbPassword,
    
    # *** تمت إضافة هذا المدخل الجديد ***
    [Parameter(Mandatory=$true)]
    [string]$PgConnectionString
)

try {
    # بناء كائن الإعدادات بالهيكل الجديد
    $configObject = @{
        db_config = @{
            user = $DbUser
            password = $DbPassword
            server = $DbServer
            database = $DbDatabase
            options = @{
                encrypt = $false
                trustServerCertificate = $true
            }
            requestTimeout = 300000
            pool = @{
                idleTimeoutMillis = 60000
            }
        }
        table_name = "SyncData_Materialized"
        # *** تم استبدال رابط جوجل بالرابط الجديد ***
        pg_connection_string = $PgConnectionString
        sync_interval_ms = 2000
        state_file = "sync_state.json"
    }

    $jsonContent = $configObject | ConvertTo-Json -Depth 5
    $utf8EncodingWithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($OutputPath, $jsonContent, $utf8EncodingWithoutBom)

    Write-Host "config.json created successfully at $OutputPath"
    exit 0
}
catch {
    Write-Error "Failed to create config.json. Error: $_"
    Read-Host "Press Enter to exit"
    exit 1
}