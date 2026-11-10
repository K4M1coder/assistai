param([string]$Workspace = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$version = '1.4.350.0'
$expected = '855b27ba05d2d8119c5114c5d4ff870ca38f2c632b11e1bb9923b9b7e6ecfe7b'
$cache = Join-Path $Workspace '.cache'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$installer = Join-Path $cache "vulkansdk-$version.exe"
$destination = Join-Path $cache "vulkan-sdk-$version"
if (-not (Test-Path -LiteralPath $installer)) {
    $url = "https://sdk.lunarg.com/sdk/download/$version/windows/vulkansdk-windows-X64-$version.exe"
    & curl.exe -L --fail --silent --show-error --output $installer $url
    if ($LASTEXITCODE -ne 0) { throw 'Vulkan SDK download failed.' }
}
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $expected) { throw "Vulkan SDK checksum mismatch: $hash" }
if ((Get-AuthenticodeSignature -LiteralPath $installer).Status -ne 'Valid') { throw 'Vulkan SDK signature is not valid.' }
if (-not (Test-Path -LiteralPath (Join-Path $destination 'Bin\glslc.exe'))) {
    $process = Start-Process -FilePath $installer -ArgumentList @('--root', $destination, '--accept-licenses', '--default-answer', '--confirm-command', 'install', 'copy_only=1') -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Vulkan SDK copy-only installation failed: $($process.ExitCode)" }
}
Write-Output "Vulkan SDK ready: $destination"
