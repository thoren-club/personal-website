$ErrorActionPreference = 'Stop'
$galleryUrl = 'http://127.0.0.1:8787/'
try { $galleryStatus = Invoke-RestMethod ($galleryUrl + '__gallery/status') -TimeoutSec 1 } catch { $galleryStatus = $null }
if ($galleryStatus -and $galleryStatus.project -eq 'zygleb-gallery') { Start-Process $galleryUrl; exit }
$galleryNode = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $galleryNode) { $galleryNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
Start-Process -FilePath $galleryNode -ArgumentList ('"' + (Join-Path $PSScriptRoot 'tools/gallery-server.cjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
for ($galleryAttempt=0; $galleryAttempt -lt 90; $galleryAttempt++) {
  Start-Sleep -Milliseconds 500
  try { $galleryStatus = Invoke-RestMethod ($galleryUrl + '__gallery/status') -TimeoutSec 1 } catch { continue }
  if ($galleryStatus.project -eq 'zygleb-gallery') { Start-Process $galleryUrl; exit }
}
throw 'Gallery did not start. Check whether port 8787 is occupied.'
