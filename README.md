# NBA Career Roulette

Static GitHub Pages build.

## Deploy on GitHub Pages

Upload these files and folders to the root of the repository:

```text
index.html
.nojekyll
styles/app.css
src/app.js
```

Then enable GitHub Pages:

```text
Settings > Pages > Build and deployment
Source: Deploy from a branch
Branch: main
Folder: /root
```

## Notes

- This is a static front-end game.
- No leaderboard/backend is included.
- Game progress is stored in browser localStorage.
- A new storage key is used for this web build, so older broken local states will not affect it.
