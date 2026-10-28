<#
  Runs the test cases in tests/cases against the real app in headless Edge (no server, no Node needed).

    powershell -ExecutionPolicy Bypass -File tests\run.ps1
    powershell -ExecutionPolicy Bypass -File tests\run.ps1 -Data "C:\path\to\scouting csv folder"
    powershell -ExecutionPolicy Bypass -File tests\run.ps1 -Case 03_fuzz

  -Data is a folder with the real scouting exports (2026vabla_scouting_data.csv, 2026chcmp_scouting_data.csv).
  They are private, so they are NOT in the repo; cases that need them are skipped without -Data.
  Exit code 0 = everything passed, 1 = something failed.
#>
param([string]$Data = '', [string]$Case = '')

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
          "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host 'Could not find Microsoft Edge or Chrome.' -ForegroundColor Red; exit 2 }

$dataUrl = ''
if ($Data) {
  if (-not (Test-Path $Data)) { Write-Host "Data folder not found: $Data" -ForegroundColor Red; exit 2 }
  $dataUrl = 'file:///' + ((Resolve-Path $Data).Path).Replace([string][char]92, '/')
}
$profile = Join-Path $env:TEMP ('torch-tests-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$tmp = Join-Path $env:TEMP ('torch-test-out-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.html')
$harness = 'file:///' + (Join-Path $here 'harness.html').Replace([string][char]92, '/')

$cases = Get-ChildItem (Join-Path $here 'cases') -Filter '*.js' | Sort-Object Name | Where-Object { -not $Case -or $_.BaseName -like "*$Case*" }
$failed = 0; $passed = 0; $skipped = 0
foreach ($c in $cases) {
  $url = $harness + '?case=' + $c.BaseName + $(if ($dataUrl) { '&data=' + [uri]::EscapeDataString($dataUrl) } else { '' })
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
  $args = @('--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--no-first-run', "--user-data-dir=$profile", '--virtual-time-budget=120000', '--dump-dom', $url)
  Start-Process -FilePath $edge -ArgumentList $args -RedirectStandardOutput $tmp -RedirectStandardError "$tmp.err" -NoNewWindow -Wait
  $html = if (Test-Path $tmp) { Get-Content $tmp -Raw -Encoding UTF8 } else { '' }
  $ms = [regex]::Matches($html, '<pre id="harness-out"[^>]*>(.*?)</pre>', 'Singleline'); $m = if ($ms.Count) { $ms[$ms.Count - 1] } else { [regex]::Match('', 'x') }
  if (-not $m.Success) { Write-Host ("FAIL  {0}: the page produced no result (script error while loading?)" -f $c.BaseName) -ForegroundColor Red; $failed++; continue }
  $r = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value) | ConvertFrom-Json
  if ($r.out.skipped) { Write-Host ("SKIP  {0}: {1}" -f $c.BaseName, $r.out.skipped) -ForegroundColor Yellow; $skipped++; continue }
  $bad = @($r.results | Where-Object { -not $_.pass })
  $good = @($r.results | Where-Object { $_.pass })
  if ($bad.Count -eq 0 -and $good.Count -gt 0) { Write-Host ("PASS  {0}  ({1} checks)" -f $c.BaseName, $good.Count) -ForegroundColor Green; $passed++ }
  else { Write-Host ("FAIL  {0}  ({1} of {2} checks failed)" -f $c.BaseName, $bad.Count, $r.results.Count) -ForegroundColor Red; $failed++; foreach ($b in $bad) { Write-Host ("        - {0}  {1}" -f $b.name, $b.detail) -ForegroundColor Red } }
}
if (Test-Path $profile) { Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path $tmp) { Remove-Item $tmp, "$tmp.err" -Force -ErrorAction SilentlyContinue }
Write-Host ("`n{0} passed, {1} failed, {2} skipped" -f $passed, $failed, $skipped)
if ($failed -gt 0) { exit 1 } else { exit 0 }
