# Programming Language Wars

A 2D pixel-art fighting game where programming languages brawl. Tekken/Mortal Kombat-style health bars and rounds, mixed with Brawlhalla-style platforms, knockback that grows as you get hurt, and ring-outs.

Plays in the browser, ships as static files, and is ready for GitHub Pages.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run sim        # headless AI-vs-AI simulation of every matchup (crash + balance check)
```

## Deploy to GitHub Pages

1. Create the repo and push (branch `main` or `master`).
2. In the repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push. `.github/workflows/deploy.yml` builds and publishes. The Vite `base` is `./`, so it works under `https://<user>.github.io/<repo>/` without configuration.

## The fighters

JavaScript, TypeScript, Python, Go, Rust, Haskell, F#, C#, C, C++ and the secret **Nirvana**.
OCaml exists only as a summoned helper (F# calls it when facing C#).

Every fighter has Light, Heavy, Block, Dodge (i-frames), double jump (3 jumps total), drop-through platforms, and three specials:

| Slot | Rule |
|------|------|
| Special 1 / 2 | cooldown only |
| Special 3 | costs meter (fills by hitting and being hit) **and** has a cooldown |

| Language | Special 1 | Special 2 | Special 3 |
|---|---|---|---|
| JavaScript | NaN Bomb (random damage) | Callback Hell (3 staggered shots) | Type Coercion (swap places, scramble controls; TypeScript resists) |
| TypeScript | Type Check (extra vs JS) | Interface Shield (reflects projectiles) | Compile Error (silences abilities) |
| Python | Import Barrage (numpy, pandas...) | Power Charge (hold: a `pass` keyword appears, release for `import torch`) | GIL Lock (roots the enemy) |
| Go | `go func()` (3 goroutines) | Defer Shield (circle of defense) | Goroutine Swarm (rain) |
| Rust | Borrow Checker (pull; strong vs C/C++) | `unsafe {}` (berserk) | Move Semantics (armored lunge) |
| Haskell | Lambda Throw (weak vs F#) | Lazy Evaluation (delayed thunk explosion) | Curried Barrage (5-lambda fan) |
| F# | Pipeline `\|>` (accelerates) | Pattern Match (counter stance) | Summons C# (OCaml if you face C#) |
| C# | LINQ Query (piercing) | async/await (speed buff) | Summons F# (C++ if you face F#) |
| C | malloc() (leaking puddle) | ptr++ (blink strike) | Buffer Overflow (huge wave; Rust takes half) |
| C++ | template&lt;T&gt; (splits into 3) | Dangling Pointer (boomerang) | Undefined Behavior (random outcome) |
| Nirvana | Refactor (homing mix of every language) | Zero Bugs (heal + purge) | `rm -rf enemy/` (telegraphed deletion) |

Nirvana passive: ignores the first hit of each round and slowly self-heals. Matchup rules live in `src/game/abilities.ts` (`matchupMod`, `helperFor`).

## Maps

VS Code, Linux Terminal, Stack Overflow/GitHub, Server Room/Kubernetes, and the secret Void of Enlightenment (only when you fight Nirvana, or after unlocking it for versus). Each has solid obstacles, one-way platforms, moving platforms and a periodic hazard. Definitions: `src/game/stages.ts`; art: `src/backgrounds.ts`.

## Modes and progression

- **Arcade Ladder**: you start with JavaScript only. Beat the next locked language to unlock it. Order: JavaScript first, Nirvana last, everything else shuffled once per save. Only wins against the AI unlock.
- **Skill Playground**: pick your fighter, pick the dummy's language (matchup modifiers apply, e.g. Haskell's lambda vs F#), pick a stage. No timer or rounds, the dummy can't be KO'd and heals when left alone, and ring-outs respawn. A panel shows last-hit damage, combo total and hit count. Esc opens options: dummy behaviour (stand, block, jump, patrol, fight back), instant vs realistic cooldowns, reset positions. Only unlocked characters are selectable.
- **Versus vs AI**: pick both fighters and the stage. Does not unlock.
- **Versus 2 Players**: local, two keyboards sides. Does not unlock.
- Matches are best of 3 rounds, 99 s timer (higher health wins on time-out), ring-outs also KO.
- AI difficulty: Easy/Normal/Hard, plus extra scaling as you climb the ladder.
- Progress is stored in `localStorage` (reset in Settings).

## Controls (rebindable in Settings → Rebind keys)

| | Player 1 | Player 2 |
|---|---|---|
| Move | A / D | ← / → |
| Jump | Space (or W) | ↑ |
| Drop / fast-fall | S | ↓ |
| Light / Heavy / Block | J / K / L | Num1 / Num2 / Num3 |
| Dodge | Left Shift | Num0 |
| Specials 1 / 2 / 3 | U / I / O | Num4 / Num5 / Num6 |

Gamepad (standard layout): stick/d-pad move, A jump, X light, Y heavy, B dodge, LB/LT block, RB / RT / Back = specials 1 / 2 / 3. Touch: on-screen buttons appear automatically on touch devices (Settings → Touch controls to force).
Esc / P / Start pauses.

## Dialog and voice-over

All lines are in `src/data/dialogs.json`, keyed `speaker → opponent (or "*") → phase`, each with an **emotion tag** (mockery, contempt, smug, anger, distress, serene, ...).

- A random fighter speaks first on the versus screen and the other replies, using a matchup-specific line when one exists.
- During fights, lines trigger on hits, taking damage, low health, specials, round win/loss and summons.
- Add a matchup by adding an entry under `speaker → opponent`; anything missing falls back to the speaker's `"*"` pool.

### Adding real voices later

1. `npm run voice:script` writes `voice-script.json` / `.csv` with every line's id, text, emotion, a voice description and a TTS style prompt.
2. Generate audio and save it as `public/voice/<id>.mp3` (e.g. `haskell.fsharp.intro.0.mp3`).
3. List the ids you generated in `public/voice/manifest.json` (`{ "ext": "mp3", "ids": [...] }`). The game plays them automatically.

Prefer streaming TTS? Listen to the `plw:line` event on `window` (`detail: { line, side }`; `line.emotion` is the tag) and call `event.preventDefault()` to disable built-in file playback. See `src/voice.ts`.

## Art, audio and code layout

- Sprites are PNG sheets (48x48 frames, 12 animations per character) generated by `tools/gen-sprites.mjs` (`npm run sprites`). Edit that script to restyle or add a character; the PNGs in `public/sprites/` are committed.
- Music and SFX are synthesised in code (`src/audio.ts`), nothing to download.
- `src/game/` is DOM-free simulation (`match.ts`, `abilities.ts`, `ai.ts`, `stages.ts`, `dialogs.ts`); `src/render.ts`, `src/backgrounds.ts`, `src/screens.ts` draw it on a 960x540 canvas.

## Dev shortcuts

In `npm run dev` only: `?fight=haskell,fsharp,terminal` jumps straight into a match, and `?screen=settings|rebind|result|stage` opens those screens. These are disabled in production builds.
