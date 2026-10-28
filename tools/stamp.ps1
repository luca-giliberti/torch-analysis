<#
  Stamps every local script and stylesheet in index.html with a fresh version (?v=...).
  Run it before each push that changes anything under js/ or css/, so browsers never mix a new index.html with an
  old cached script or stylesheet:

    powershell -ExecutionPolicy Bypass -File tools\stamp.ps1
#>
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$file = Join-Path $root 'index.html'
$stamp = Get-Date -Format 'yyyyMMddHHmm'
$text = [System.IO.File]::ReadAllText($file)
$new = [regex]::Replace($text, '((?:js|css)/[\w-]+\.(?:js|css))\?v=\w+', "`$1?v=$stamp")
[System.IO.File]::WriteAllText($file, $new, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Stamped scripts and stylesheet with v=$stamp"
