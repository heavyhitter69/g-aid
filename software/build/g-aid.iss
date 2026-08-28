; G-AID Windows installer (Inno Setup 6).
; The compiled Setup.exe + Setup-*.bin live in dist_desktop (not in git).
; Disk spanning is used because bundled Ollama models are multi-gigabyte.

#define MyAppName "G-AID"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Genie Platforms"
#define MyAppURL "https://github.com/heavyhitter69/g-aid"
#define MyAppExeName "G-AID.exe"
#define MyAppId "{{8E6C2A1B-4F3D-4A9E-9C71-A1B2C3D4E5F6}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=no
AllowNoIcons=yes
OutputDir=dist_desktop
OutputBaseFilename=G-AID-Setup
SetupIconFile=icon.ico
WizardImageFile=wizard-big.bmp
WizardSmallImageFile=wizard-small.bmp
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
Compression=lzma2/ultra64
SolidCompression=yes
; Split the payload so the wizard .exe stays small; keep G-AID-Setup.bin beside it.
DiskSpanning=yes
DiskSliceSize=2100000000
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "Pin a Start Menu shortcut"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist_desktop\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
