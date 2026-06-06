# =============================================================================
# Student Account Tracker — Windows Deploy Helper
# Triggers a production deploy to WSL from a PowerShell terminal.
# Usage:  .\scripts\linux\deploy-to-wsl.ps1
#         .\scripts\linux\deploy-to-wsl.ps1 -FullInstall
# =============================================================================
param(
    [switch]$FullInstall
)

$ScriptDir = "C:\Scripts\student account\scripts\linux"

if ($FullInstall) {
    Write-Host "`nRunning full production install in WSL..." -ForegroundColor Cyan
    wsl bash "/mnt/c/Scripts/student account/scripts/linux/install-student-account.sh"
} else {
    Write-Host "`nDeploying update to WSL..." -ForegroundColor Cyan
    wsl bash "/mnt/c/Scripts/student account/scripts/linux/upgrade-student-account.sh"
}
