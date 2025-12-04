; Inno Setup Script for Kayan Sync Service (v12 - Correct Logic)

#define MyAppName "Kayan Sync Service"
#define MyAppVersion "1.0"
#define MyAppPublisher "Your Company Name"
#define NodeInstaller "node-v20.9.0-x64.msi"

[Setup]
AppId={{AUTO}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf64}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.\InstallerOutput 
OutputBaseFilename=KayanSyncSetup-v1.0-PG
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"

[Files]
; سنقوم بنسخ كل الملفات من مجلد dist (الذي لا يحتوي على config.json)
Source: "dist\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs
Source: "{#NodeInstaller}"; DestDir: "{tmp}"; Flags: deleteafterinstall
; *** تم حذف السطر الذي كان يحاول نسخ الملف من المجلد المؤقت ***

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\index.html"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

[Run]
Filename: "msiexec.exe"; Parameters: "/i ""{tmp}\{#NodeInstaller}"" /qn"; StatusMsg: "جاري تثبيت بيئة التشغيل Node.js..."; Flags: shellexec waituntilterminated; Check: not IsNodeInstalled

; *** هذا هو التعديل الحاسم: العودة إلى إنشاء الملف مباشرة في مجلد التثبيت {app} ***
; الآن بعد أن حلت كل المشاكل الأخرى، يجب أن تعمل هذه الطريقة بنجاح.
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\create_config.ps1"" -OutputPath ""{app}\config.json"" -DbServer ""{code:GetDbServer}"" -DbDatabase ""{code:GetDbName}"" -DbUser ""{code:GetDbUser}"" -DbPassword ""{code:GetDbPass}"" -PgConnectionString ""{code:GetPgString}"""; StatusMsg: "جاري إعداد ملفات التكوين..."; Flags: shellexec waituntilterminated

Filename: "{app}\setup_tasks.bat"; StatusMsg: "جاري تنفيذ مهام الإعداد النهائية..."; Flags: shellexec waituntilterminated

[UninstallRun]
Filename: "{app}\uninstall_tasks.bat"; Flags: runhidden shellexec waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{app}\node_modules"
Type: files; Name: "{app}\config.json"
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{commonappdata}\KayanSyncService" 

[Code]
// لم يتم تغيير أي شيء في هذا القسم. يبقى كما هو.
var
  ConfigPage: TWizardPage;
  DBServerEdit, DBNameEdit, DBUserEdit, DBPassEdit, PgEdit: TEdit;

function IsNodeInstalled: Boolean;
var
  InstallPath: string;
begin
  Result := RegQueryStringValue(HKLM, 'SOFTWARE\Node.js', 'InstallPath', InstallPath) and (InstallPath <> '');
  if not Result then
    Result := RegQueryStringValue(HKCU, 'SOFTWARE\Node.js', 'InstallPath', InstallPath) and (InstallPath <> '');
end;

procedure CreateConfigPage;
var
  PageLabel, DBServerLabel, DBNameLabel, DBUserLabel, DBPassLabel, PgLabel: TLabel;
begin
  ConfigPage := CreateCustomPage(wpWelcome, 'إعدادات الاتصال', 'الرجاء إدخال معلومات الاتصال المطلوبة.');
  PageLabel := TLabel.Create(ConfigPage); PageLabel.Parent := ConfigPage.Surface; PageLabel.Caption := 'معلومات الاتصال بقاعدة البيانات المصدر (SQL Server)'; PageLabel.Top := 10; PageLabel.Left := 10;
  DBServerLabel := TLabel.Create(ConfigPage); DBServerLabel.Parent := ConfigPage.Surface; DBServerLabel.Caption := 'اسم السيرفر:'; DBServerLabel.Top := PageLabel.Top + 25; DBServerLabel.Left := 10;
  DBServerEdit := TEdit.Create(ConfigPage); DBServerEdit.Parent := ConfigPage.Surface; DBServerEdit.Top := DBServerLabel.Top; DBServerEdit.Left := 100; DBServerEdit.Width := 300; DBServerEdit.Text := 'localhost\\SQLEXPRESS';
  DBNameLabel := TLabel.Create(ConfigPage); DBNameLabel.Parent := ConfigPage.Surface; DBNameLabel.Caption := 'اسم القاعدة:'; DBNameLabel.Top := DBServerEdit.Top + 25; DBNameLabel.Left := 10;
  DBNameEdit := TEdit.Create(ConfigPage); DBNameEdit.Parent := ConfigPage.Surface; DBNameEdit.Top := DBNameLabel.Top; DBNameEdit.Left := 100; DBNameEdit.Width := 300; DBNameEdit.Text := 'kayan';
  DBUserLabel := TLabel.Create(ConfigPage); DBUserLabel.Parent := ConfigPage.Surface; DBUserLabel.Caption := 'اسم المستخدم:'; DBUserLabel.Top := DBNameEdit.Top + 25; DBUserLabel.Left := 10;
  DBUserEdit := TEdit.Create(ConfigPage); DBUserEdit.Parent := ConfigPage.Surface; DBUserEdit.Top := DBUserLabel.Top; DBUserEdit.Left := 100; DBUserEdit.Width := 300; DBUserEdit.Text := 'testuser';
  DBPassLabel := TLabel.Create(ConfigPage); DBPassLabel.Parent := ConfigPage.Surface; DBPassLabel.Caption := 'كلمة المرور:'; DBPassLabel.Top := DBUserEdit.Top + 25; DBPassLabel.Left := 10;
  DBPassEdit := TEdit.Create(ConfigPage); DBPassEdit.Parent := ConfigPage.Surface; DBPassEdit.Top := DBPassLabel.Top; DBPassEdit.Left := 100; DBPassEdit.Width := 300; DBPassEdit.PasswordChar := '*'; DBPassEdit.Text := 'testpass123';
  PgLabel := TLabel.Create(ConfigPage); PgLabel.Parent := ConfigPage.Surface; PgLabel.Caption := 'رابط الاتصال بقاعدة بيانات PostgreSQL (الهدف):'; PgLabel.Top := DBPassEdit.Top + 40; PgLabel.Left := 10;
  PgEdit := TEdit.Create(ConfigPage); PgEdit.Parent := ConfigPage.Surface; PgEdit.Top := PgLabel.Top + 20; PgEdit.Left := 10; PgEdit.Width := 400; PgEdit.Text := 'postgresql://mounir:123@185.172.57.61:5432/';
end;

procedure InitializeWizard;
begin
  CreateConfigPage;
end;

function GetDbServer(Param: String): String; begin Result := DBServerEdit.Text; end;
function GetDbName(Param: String): String; begin Result := DBNameEdit.Text; end;
function GetDbUser(Param: String): String; begin Result := DBUserEdit.Text; end;
function GetDbPass(Param: String): String; begin Result := DBPassEdit.Text; end;
function GetPgString(Param: String): String; begin Result := PgEdit.Text; end;