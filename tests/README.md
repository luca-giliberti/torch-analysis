# Tests

Runs the real app in headless Edge (or Chrome) against synthetic data and, optionally, your real scouting files.
No server, no Node, no installs.

```powershell
# everything that doesn't need private data
powershell -ExecutionPolicy Bypass -File tests\run.ps1

# also the real-data checks (accuracy on real matches, numbers checked against an independent calculation)
powershell -ExecutionPolicy Bypass -File tests\run.ps1 -Data "C:\path\to\folder with 2026vabla_scouting_data.csv and 2026chcmp_scouting_data.csv"

# one case (matches part of the file name)
powershell -ExecutionPolicy Bypass -File tests\run.ps1 -Case draft
```

It prints PASS / FAIL / SKIP per case and exits non-zero if anything failed. **Run it before every push.**

## What is here

| File | What it checks |
|---|---|
| `cases/01_parse_csv.js` | CSV reading, quotes, BOM, hostile ids, script injection through comments |
| `cases/02_stats_cleaning.js` | Hand-worked numbers: typos ignored, scouts averaged, duplicates, every tab agrees |
| `cases/03_fuzz.js` | 16 awkward datasets x every screen: nothing may throw |
| `cases/04_banner_quiet.js` | Error banner: silent when fine, lists real errors once |
| `cases/05_banner_nochart.js` | Chart library missing: notice shown, everything else still works |
| `cases/06_banner_syntax.js` | Broken app script: the banner still explains why |
| `cases/07_predict_button.js` | Predict Winner in every situation |
| `cases/08_schedule_views.js` | Next / Strength / Compare, shared "your team" |
| `cases/09_picklist.js` | Alliance suggestions and statuses |
| `cases/11_draft.js` | Alliance selection simulation |
| `cases/10_real_data.js` | Real data (needs `-Data`) |
| `fixtures/` | Public schedules and scores from The Blue Alliance (no private data) |

## Writing a case

A case is the body of `function (t) { ... }`. `lib.js` (synthetic CSV builders: `row`, `csv`, `many`, `loadSynthetic`,
`E`) is in scope. Use `t.check(name, ok, detail)`. A first line `// variant: nochart` or `// variant: syntax`
loads a deliberately broken copy of the app. The real scouting files are private: never commit them.
