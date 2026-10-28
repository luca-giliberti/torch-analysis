# Torch Analysis

An FRC (FIRST Robotics Competition) scouting and match-analysis web app. Load your scouting-data CSVs to rank teams, compare robots, chart metrics, take notes, predict matches, see your next match and schedule strength, and plan alliance selection.

## Live site

https://luca-giliberti.github.io/torch-analysis/

## Usage

Open the site, go to the **Import** tab, and upload your scouting CSV files. Data is cached in your browser (localStorage). No server or account needed.

## Layout

```
index.html        the page (markup) and the script/stylesheet includes
css/styles.css    all styling
js/               the app, in load order (core, views, charts, notes, navigation, predictor-model,
                  predictor-ui, flags, picklist, rotation, schedule, init). One shared global scope.
chart.umd.min.js  Chart.js, bundled so charts work offline
tests/            automated tests (see tests/README.md)
tools/stamp.ps1   bumps the ?v= version on scripts and stylesheet before a push
docs/             what the predictor measured, and what to fix in the scouting form
```

## Updating

1. Edit files under `js/`, `css/` or `index.html`.
2. Run the tests: `powershell -ExecutionPolicy Bypass -File tests\run.ps1` (add `-Data "<folder with the scouting CSVs>"` for the real-data checks).
3. If you changed anything in `js/` or `css/`, stamp the version so browsers don't mix old and new files:
   `powershell -ExecutionPolicy Bypass -File tools\stamp.ps1`
4. Commit and push:

```bash
git add -A index.html js css tests tools docs
git commit -m "Describe your change"
git push
```

GitHub Pages redeploys automatically within a minute or two. If something on the page stops working, a red banner at the top says why.
