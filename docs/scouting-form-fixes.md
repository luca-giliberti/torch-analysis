# Scouting form: what to fix

These notes come from the 2026 `vabla` (658 entries) and `chcmp` (977 entries) exports. The analysis app
can only be as good as the data the form collects, and a few things in the form are costing accuracy.
Everything below is something to change in the **data-collection form**, not in this app.

## 1. Columns that are never filled in

Same value in **every** entry of both exports, so they carry no information:

| Column | Always | Effect in the analysis app |
|---|---|---|
| `endgame_climb_level` | `0` | Climbing cannot be modelled, charted or used in picks |
| `endgame_climb_time` | `0` | – |
| `auto_duration_ms`, `teleop_duration_ms`, `outpost_duration_ms`, `passed_duration_ms`, `refueled_duration_ms`, `ball_starving_duration_ms` | `0` | The timers never ran, or are not exported |
| `ability_outpost` | blank | – |

Nearly constant (over 98%): `endgame_climb_pos` (`center`), `robot_climbing_speed` (`0`), and `auto_climb` (`no` in
`vabla`; only 23 non-"no" entries in `chcmp`). Either fix the form so these record real values, or remove them
from the export.

**Climbing is the one that matters most.** It is a scoring action, and right now no robot's climb is known.

## 2. Values that look like left-at-default

- `auto_accuracy` is `50` in about 37% of `vabla` entries and 28% of `chcmp` entries, far more than any other value.
- `robot_accuracy` is `50` in 13% of `vabla` entries.

If the slider starts at 50, a scout who never touches it records a guess. Start sliders **unset** (and export blank),
or require a touch before saving.

## 3. Typos and missed robots

- A few entries are far too large for the robot (for example 365 auto shots for a robot whose other autos are 0 to 75).
  The app ignores those automatically, but a form limit would stop them being entered. Suggestion: ask "That is a lot
  (over 120). Are you sure?" for shots above a sensible ceiling.
- Where two scouts watched the same robot, one logged **zero shots while the other saw 30 or more** in dozens of
  cases. That is almost always a scout who watched the wrong robot or lost track. Suggestion: if shots are 0 and the
  robot was not marked disabled or no-show, ask "Zero shots recorded. Did this robot not shoot at all?"
- Team numbers should be picked from the event's team list rather than typed.

## 4. Scouts disagree a lot

For robots watched by two or more scouts in the same match, shot counts typically differ by about **40%**. A handful
of scouts read consistently about 40 shots low (or 40 to 60 high) compared with the others. The app lists them on
**Predict, Data quality**. A short calibration session before the event helps most: everyone scouts the same
recorded match, then compare counts and agree on what counts as a shot.

We tested correcting for this in software (per-scout adjustment, ignoring lone zero entries) against 166 real
matches. It did not improve predictions, because the errors are not consistent enough to undo. Fixing it at
the source is the way.

## 5. Export hygiene

- The `vagle` file was a byte-identical copy of the `vabla` file, so no Glen Allen scouting reached the app. Check
  that each export is for the event its file name says. The app now warns on the Import tab when a file's rows are all
  copies of another file's.
- Keep the `event` column accurate; the app credits data to the event named in the file name and uses the `event`
  column to pick the right copy when two files overlap.

## 6. Autonomous path data (for the planned auto-path viewer)

To show where robots go in auto, each entry needs structured path data. Suggested columns (names are suggestions;
the viewer will be built around whatever you record):

| Column | Example | Meaning |
|---|---|---|
| `auto_start_pos` | `left` / `center` / `right` | Where the robot started |
| `auto_path` | `start>neutral>shoot>depot` | Ordered zones or waypoints, `>`-separated |
| `auto_collected` | `4` | Game pieces picked up |
| `auto_shots` | `8` | (already present) |
| `auto_result` | `ok` / `stalled` / `no_move` | How it ended |
| `auto_points` | `12` | Points scored in auto |

Use a fixed list of zone names so the same place is always written the same way.
