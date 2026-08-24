# dsh-token-usage 打包脚本
# 生成 npm .tgz，供 dsh plugin --profile web add ... 使用。
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
Push-Location $root
try {
    if (Test-Path .\dsh-token-usage-*.tgz) {
        Remove-Item .\dsh-token-usage-*.tgz -Force
    }
    npm pack --pack-destination .
    if ($LASTEXITCODE -ne 0) { throw "npm pack failed (exit $LASTEXITCODE)" }
    Get-ChildItem .\dsh-token-usage-*.tgz | Select-Object Name, Length
    Write-Host ""
    Write-Host "打包完成。安装："
    Write-Host "  dsh plugin --profile web add dsh-token-usage@file:$root\$(Get-ChildItem .\dsh-token-usage-*.tgz | Select-Object -First 1 -ExpandProperty Name)"
    Write-Host "然后重启 dsh web。"
}
finally {
    Pop-Location
}
