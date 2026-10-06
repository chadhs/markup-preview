$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $IsWindows) {
    throw 'Run this installer lifecycle check only on a disposable Windows GitHub Actions runner.'
}

$installers = @(Get-ChildItem release/*-win-x64-setup.exe)
if ($installers.Count -ne 1) { throw 'Expected exactly one Windows installer.' }
$installDirectory = Join-Path $env:LOCALAPPDATA 'Programs/markup-preview'
$executable = Join-Path $installDirectory 'Markup Preview.exe'
$uninstaller = Join-Path $installDirectory 'Uninstall Markup Preview.exe'
$shortcut = Join-Path $env:APPDATA 'Microsoft/Windows/Start Menu/Programs/Markup Preview.lnk'
$profile = Join-Path $env:APPDATA 'Markup Preview'
$sentinel = Join-Path $profile 'installer-test-preferences.txt'
$associations = @{ org = 'com.chadhs.markup-preview.org'; md = 'com.chadhs.markup-preview.markdown'; markdown = 'com.chadhs.markup-preview.markdown' }
if (Test-Path $installDirectory) { throw 'Refusing to replace an existing installation.' }

function Install-Application {
    $installerProcess = Start-Process -FilePath $installers[0].FullName -ArgumentList '/S' -Wait -PassThru
    if ($installerProcess.ExitCode -ne 0) { throw "Installer exited with $($installerProcess.ExitCode)." }
    foreach ($file in @($executable, $uninstaller, $shortcut)) {
        if (-not (Test-Path $file)) { throw "Installation is missing $file" }
    }
    foreach ($extension in $associations.Keys) {
        $class = $associations[$extension]
        $openWith = Get-Item "HKCU:\Software\Classes\.$extension\OpenWithProgids"
        if ($openWith.GetValueNames() -notcontains $class) { throw "Missing Open with registration for .$extension" }
        $command = (Get-Item "HKCU:\Software\Classes\$class\shell\open\command").GetValue('')
        if ($command -ne "`"$executable`" `"%1`"") { throw "Incorrect file-opening command: $command" }
    }
}

try {
    Install-Application
    New-Item -ItemType Directory -Force $profile | Out-Null
    Set-Content -Path $sentinel -Value 'Keep reader preferences' -NoNewline
    $env:MARKUP_PREVIEW_EXECUTABLE = $executable
    & node scripts/smoke.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Installed application smoke test failed.' }
    Install-Application
    if ((Get-Content $sentinel -Raw) -ne 'Keep reader preferences') { throw 'Reinstall changed app data.' }
} finally {
    Remove-Item Env:MARKUP_PREVIEW_EXECUTABLE -ErrorAction SilentlyContinue
    if (Test-Path $uninstaller) {
        $uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
        if ($uninstallProcess.ExitCode -ne 0) { throw "Uninstaller exited with $($uninstallProcess.ExitCode)." }
        $deadline = (Get-Date).AddSeconds(30)
        while ((Test-Path $executable) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
        if (Test-Path $executable) { throw 'Uninstall left the application executable behind.' }
        if (Test-Path $shortcut) { throw 'Uninstall left the Start menu shortcut behind.' }
        foreach ($class in ($associations.Values | Select-Object -Unique)) {
            if (Test-Path "HKCU:\Software\Classes\$class") { throw "Uninstall left file registration $class behind." }
        }
        if (Test-Path $sentinel) {
            if ((Get-Content $sentinel -Raw) -ne 'Keep reader preferences') { throw 'Uninstall changed app data.' }
        } else { throw 'Uninstall removed app data.' }
    }
    Remove-Item $sentinel -ErrorAction SilentlyContinue
}
Write-Output 'Windows installer passed: per-user install, file registrations, installed-app smoke, reinstall, and uninstall with app data preserved.'
