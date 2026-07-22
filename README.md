# NBA Career Roulette - GitHub Static V2

Static GitHub Pages build.

Updates in V2:
- Final rating now uses visible 100-point categories:
  - Stats /30
  - Awards /25
  - Winning /25
  - Longevity /10
  - Legacy /10
- Winning is weighted more heavily toward championships.
- Offseason spins affect Legacy:
  - Off-court events already affect `legacyBoost`
  - Training focus now also nudges `legacyBoost`
- Final sharing card is neutral white/grey, not team-specific.
- Career averages exclude non-NBA seasons.

Upload these files and folders to the root of your repository:

```text
index.html
.nojekyll
styles/app.css
src/app.js
.github/workflows/pages.yml
```
