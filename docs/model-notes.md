# Match predictor: what was measured

Everything here was measured on real 2026 matches, using public scores from The Blue Alliance
(`tests/fixtures/`) and the team's own scouting exports (kept out of the repo). Each match is predicted
**without its own scouting** (leave-one-match-out), so the numbers are what you would have got before the match.

## How accurate is it

| Scouting used | Matches | Picks the winner | Plain sum of team EPAs |
|---|---|---|---|
| Same event (`vabla` scouting, `vabla` scores) | 60 | **82%** | 82% |
| Same event (`chcmp` scouting, `chcmp` scores) | 106 | **81%** | 79% |
| Other events only | 234 | 67% | 68% |

So the model is about as good as simply adding up each team's EPA. Scouting from the event you are at matters far
more than any model detail.

## Win-chance percentages

The simulation's raw win chance is overconfident, so its z-score is divided by a tempering factor (`PRED.TEMP`,
`PRED.TEMP_SAME` in `index.html`):

- Scouting from **other events**: best factor about 2.5 (pooled), used 2.3.
- Scouting from the **same event**: best factor 1.2 (pooled; 1.4 and 1.0 per event).

The app uses the same-event value when the schedule's own event is in the scouting data (`predScheduleEvent`), easing
toward the other-event value for robots with little same-event data.

## Ideas that were tested and did not help

All measured with the same leave-one-match-out setup on both events, on score correlation, score error and winner
accuracy. None beat the plain model, so none are in the app.

| Idea | Result |
|---|---|
| Correct each scout's reading bias (per-scout multiplier) | Same or slightly worse |
| Ignore a zero-shot entry when another scout saw 30+ shots | No change |
| Weight recent matches more (time constants 10 to 120 matches) | No reliable gain; hurts at short constants. Also tried predicting each match from earlier matches only |
| Fit per-team corrections from real scores on top of the scouting model | Neutral at best; worse on `chcmp` |
| Rate teams from scores alone (like OPR) | Clearly worse than scouting (score error 62 to 104 vs 55 to 67) with about 12 matches per team |

Test sets are small (60 and 106 matches, winner accuracy has a standard error of about 4 points), so only large
effects can be seen. If a much bigger data set becomes available, these are cheap to re-run.

## Data quality facts that shaped this

- Scouts of the same robot differ by about 40% on shot counts; a few read consistently 40 shots low.
- A 365-shot typo is real; the outlier rule (single entry 60+ and over 3x the team's biggest other value) catches those.
- See `docs/scouting-form-fixes.md` for what to change at the source.

## Alliance selection simulation

How the real draft works, as simulated (`js/picklist.js`): seeds 1 to 8 are captains; round 1 goes seed 1 to 8, round 2
goes seed 8 to 1. In round 1 a captain may pick **any** team not yet on an alliance, including a lower-seeded captain
(then that alliance disappears, the ones below move up, and the best unaligned team becomes the last captain). At
2026 vabla seed 3 picked seed 4. In round 2 only unaligned teams are left.

**How a captain chooses** was fitted on the 32 real picks at 2026 vabla and chcmp, each pick against everyone still
eligible (`tests/fixtures/*_selection.json`):

- The chance of picking a team is proportional to `(strength + 5) ^ 5.5`.
- The picked team was one of the 3 strongest available in 24 of 32 picks, but the single strongest in only 14.
- Qualification rank added almost nothing once strength is known, so it is not used.

**Checked against what really happened:** seeded with the real final rankings and run 400 times, the predicted chance
of making an alliance matched reality (Brier 0.091 at vabla and 0.020 at chcmp, vs 0.160 and 0.249 for a flat guess).
Teams the simulation gave under 10% made an alliance 1 time in 25; teams it gave over 90% made it 36 of 36.
So a robot rated far below the pack really is almost never picked.

Limits: the other teams' real qualification ranks are not known to the app (seeds are estimated from strength unless you
enter your own rank), declines are not modelled, and real captains also weigh fit and relationships.
