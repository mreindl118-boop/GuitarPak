# soundLAB 2.0 design system — "E · Stage"

Chosen 2026-11-09 after three rounds of home-page mockups. The reference picture
is `docs/design/home-e-stage.png`; its source is `docs/design/home-mockup.html`
(open with `?theme=e`; `?theme=f` is the runner-up kept for comparison). Tokens
live in `css/tokens.css` and load before everything else.

## Principles

1. **One thing on screen.** A page shows the next step and a Start button. The
   plan, streak and goal are one quiet footer line. Everything else is behind
   "Something else" or a sheet. Dashboards of cards were rejected as "too busy
   and too plain".
2. **The instrument is the hero.** Keyboard for a keys lesson, neck for guitar
   or bass, pads for drums, lit exactly as the LUMI (or the on-screen neck)
   will be: degree colors, filled key = play this now.
3. **The key bar is always there.** Key · Tempo · Scale lock (with a
   plain-words hint such as "only A Dorian notes sound") · LUMI lights mode ·
   Help level. Same bar on every page; never buried in a menu.
4. **Plain words.** Labels say what happens ("only scale notes sound"), not
   what the setting is called.
5. **Four instruments, one kit.** Guitar, bass, keys and drums get the same
   components: lessons, exercises, Woodshed, Help levels, plan blocks, progress.

## Tokens (css/tokens.css)

| Group | Tokens | Notes |
|---|---|---|
| Surfaces | `--sl-bg`, `--sl-bg-raised`, `--sl-surface`, `--sl-surface-2`, `--sl-line`, `--sl-overlay` | Dark stage `#0f0d10`; light theme is a token swap |
| Ink | `--sl-ink`, `--sl-ink-muted`, `--sl-ink-faint` | muted ≥ 4.5:1 on bg; faint is decorative only |
| Accent | `--sl-accent` (tube amber), `--sl-accent-ink`, `-soft`, `-line`, `-glow` | the ONLY accent; never a second hue for emphasis |
| Status | `--sl-ok`, `--sl-warn`, `--sl-bad`, `--sl-info` | re-inked in light |
| Degrees | `--sl-deg-1` … `--sl-deg-7` | scale-degree colors; 1 is always the 1 color |
| Type | `--sl-font-display` (Bebas, caps), `--sl-font-body` (Barlow), `--sl-font-cond`; `--sl-text-*`, `--sl-display-*` | one headline per page at `--sl-display-lg` |
| Space | `--sl-space-1..8` (4 px grid), `--sl-gutter` 16 px | |
| Shape | `--sl-radius-sm/md/lg/pill` | buttons are pills; cards 12 px |
| Controls | `--sl-control-h` 44 px (48 on touch), `--sl-focus` | every control is tappable at 44 px |
| Motion | `--sl-dur-fast`, `--sl-dur`, `--sl-ease` | zero under reduce-motion |

## Components to build in Phase B (all from tokens, none hand-colored)

Buttons (primary pill, ghost, icon) · Chips/status dots · Switch (Scale lock) ·
Select chip (Key, LUMI lights) · Stepper (Tempo) · Help-level dots · Key bar ·
Header (wordmark, 5 tabs, status, gear) · Footer line with goal ring · Card ·
Row (plan block with check state) · Sheet (bottom on phones, side on wide) ·
Toast · Empty / loading / error states · Instrument heroes (keyboard, neck,
pads) sharing one lighting model.

## Layout

- Phone first: 16 px gutters, no horizontal scroll, bottom tab bar ≤ 900 px.
- Tablet and PC: the hero spans the width; type scales with `clamp()`.
- FL plugin window (later): everything must work at 1024 × 640.
- Headline never wraps past two lines; the hero is never cropped.

## Accessibility

- Contrast AA for all text in both themes (tokens are chosen for it).
- Visible focus ring (`--sl-focus`) on every control; full keyboard path.
- Labels for every control; status by text + icon, not color alone.
- Respect `prefers-reduced-motion`; no autoplaying motion on the home.

## Re-rendering the mockups

```
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();
const c=await b.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2});const p=await c.newPage();
await p.goto('file://'+process.cwd()+'/docs/design/home-mockup.html?theme=e');await p.evaluate(()=>document.fonts.ready);
await p.screenshot({path:'docs/design/home-e-stage.png'});await b.close();})()"
```
