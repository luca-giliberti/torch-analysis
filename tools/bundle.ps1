<#
  Builds ONE self-contained file (dist\torch-analysis-standalone.html) with the stylesheet, every script and
  Chart.js inlined. Use it to open or share the app as a single file (the Claude file pane, email, a USB stick).
  The normal site and the tests use the split files; this is only a convenience copy.

    powershell -ExecutionPolicy Bypass -File tools\bundle.ps1
    powershell -ExecutionPolicy Bypass -File tools\bundle.ps1 -Check
        # also opens it in headless Edge and checks that it starts cleanly
    powershell -ExecutionPolicy Bypass -File tools\bundle.ps1 -DemoData "C:\path\to\scouting csvs"
        # dist\torch-analysis-demo.html: also has your scouting CSVs and the vabla schedule preloaded, for looking around.
        # It contains your private data, so it stays in dist\ (git ignores that folder). Never commit or publish it.
#>
param([switch]$Check, [string]$DemoData = '')

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$utf8 = New-Object System.Text.UTF8Encoding($false)
$html = [System.IO.File]::ReadAllText((Join-Path $root 'index.html'), $utf8)

# stylesheet
$m = [regex]::Match($html, '<link rel="stylesheet" href="(css/[\w-]+\.css)[^"]*">')
if (-not $m.Success) { throw 'stylesheet link not found' }
$css = [System.IO.File]::ReadAllText((Join-Path $root $m.Groups[1].Value), $utf8)
$html = $html.Replace($m.Value, "<style>`n$css`n</style>")

# Chart.js, then every app script in the order index.html lists them
$chartTag = '<script src="chart.umd.min.js"></script>'
if (-not $html.Contains($chartTag)) { throw "index.html does not contain: $chartTag" }
$chart = [System.IO.File]::ReadAllText((Join-Path $root 'chart.umd.min.js'), $utf8)
$html = $html.Replace($chartTag, "<script>`n$chart`n</script>")
$count = 0
foreach ($s in [regex]::Matches($html, '<script src="(js/[\w-]+\.js)[^"]*"></script>')) {
  $code = [System.IO.File]::ReadAllText((Join-Path $root $s.Groups[1].Value), $utf8)
  if ($code.Contains('</script')) { throw ("{0} contains a closing script tag and cannot be inlined" -f $s.Groups[1].Value) }
  $html = $html.Replace($s.Value, "<script>`n$code`n</script>")
  $count++
}
if ($html -match '<script src=|<link rel="stylesheet"') { throw 'some file references were left un-inlined' }

# optional: preload real scouting files and a schedule, so the file opens ready to explore (no import step, no password)
if ($DemoData) {
  $files = @{}
  Get-ChildItem $DemoData -Filter '*_scouting_data.csv' | ForEach-Object { $files[$_.Name] = [System.IO.File]::ReadAllText($_.FullName, $utf8) }
  if (-not $files.Count) { throw "no *_scouting_data.csv files in $DemoData" }
  $schedPath = Join-Path (Join-Path $root 'tests') (Join-Path 'fixtures' '2026vabla_schedule.csv')
  $sched = [System.IO.File]::ReadAllText($schedPath, $utf8)
  $seed = (@{ files = $files; schedule = $sched; me = '346' } | ConvertTo-Json -Depth 4 -Compress).Replace('</', '<\/')
  $js = "<script>`n(function(){ var D = $seed; Object.keys(D.files).forEach(function(n){ addFile(n, D.files[n]); }); document.getElementById('schedule-paste').value = D.schedule; parseSchedulePaste(); setMyTeam(D.me); showPage('schedule'); setSchedFilter('next'); })();`n</script>"
  $html = $html.Replace('</body>', $js + "`n</body>")
}

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$name = 'torch-analysis-standalone.html'
if ($DemoData) { $name = 'torch-analysis-demo.html' }
$out = Join-Path $dist $name
[System.IO.File]::WriteAllText($out, $html, $utf8)
Write-Host ('Built {0}  ({1} scripts + Chart.js + styles inlined, {2:N0} KB)' -f $out, $count, ((Get-Item $out).Length / 1KB))

if ($Check) {
  $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $edge) { Write-Host 'No Edge or Chrome found, skipping the check.' -ForegroundColor Yellow; exit 0 }
  $profile = Join-Path $env:TEMP ('torch-bundle-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  $dump = "$profile.html"
  $url = 'file:///' + $out.Replace([string][char]92, '/')
  Start-Process -FilePath $edge -ArgumentList @('--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--no-first-run', "--user-data-dir=$profile", '--virtual-time-budget=15000', '--dump-dom', $url) -RedirectStandardOutput $dump -RedirectStandardError "$dump.err" -NoNewWindow -Wait
  $dom = [System.IO.File]::ReadAllText($dump, $utf8)
  $ok = $dom.Contains('id="rankings-list"') -and -not $dom.Contains('id="error-banner"')
  Remove-Item $dump, "$dump.err" -Force -ErrorAction SilentlyContinue
  Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
  if ($ok) { Write-Host 'Check passed: it starts with no errors.' -ForegroundColor Green }
  else { Write-Host 'Check FAILED: the page showed an error banner or did not start.' -ForegroundColor Red; exit 1 }
}
