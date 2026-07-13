# AYN button HUD cycle (Thor bottom-screen performance overlay)

Date: 2026-07-12
Device: AYN Thor (dual screen, `ARMADA_GAMING_SESSION=nested`)
Branch: `bottom-screen-perf`

## Goal

Pressing the Thor's AYN button while Steam runs on the top screen cycles the
MangoHud performance overlay through three states: top-screen overlay (today's
behavior) → fullscreen HUD on the bottom screen → no HUD → back to top.

## Background and constraints

- The AYN button is `KEY_F24` on the `gpio-keys` input device
  (`/dev/input/by-path/platform-gpio-keys-event`), verified by live capture.
  It is not managed by InputPlumber and currently does nothing. Volume-up
  lives on the same device, so the listener must not grab it exclusively.
- mangoapp receives FPS/frametime stats from gamescope over a SysV message
  queue (`msgget`/`msgrcv`, verified against the shipped binary). Message
  queues are single-consumer: exactly one mangoapp instance may run at a
  time, or both show garbage. This is the core constraint; exclusivity is
  enforced with systemd `Conflicts=`, not script discipline.
- The `armada` user is in the `input` group, so a user-level evdev reader
  needs no permission changes.
- In nested gaming, `nested-gaming` currently runs the top-screen mangoapp
  as an inline restart-loop after the gamescope readiness handshake, with
  `MANGOHUD_CONFIGFILE` pointing at a tmpfile that Steam rewrites when the
  performance-overlay slider changes.

## States

State is held entirely by systemd — it is simply which HUD unit is active.
No state files.

| State  | Definition | Behavior |
|--------|------------|----------|
| top    | `armada-hud-top.service` active | mangoapp inside nested gamescope; Steam's performance-overlay slider controls visibility and level, exactly as today |
| bottom | `armada-hud-bottom.service` active | mangoapp as a desktop window pinned fullscreen to the bottom panel, own full-stats config; Steam's slider has no effect |
| off    | neither active | no HUD anywhere; the slider does nothing (no stats consumer exists) |

Cycle per AYN press: top → bottom → off → top. Presses are ignored unless
`armada-nested-gaming.service` is active. Every gaming session start —
including Steam client-update restarts — begins in `top`.

Accepted quirk (user-approved): in `top` state with the Steam slider set to
off, that cycle stop looks identical to `off`.

## Components

### 1. Button listener — `armada-ayn-button.service` + `/usr/libexec/armada/hud-cycle-listener`

- User unit, `PartOf=graphical-session.target`, started by
  `desktop-bootstrap` alongside `armada-nested-gaming.service` (repo has no
  user-preset enabling; explicit start is the established pattern).
- Script evals `/usr/libexec/armada/device-env`. If the button vars are
  unset it exits 0 — the unit is inert on devices without the button.
- Otherwise it reads the device with `stdbuf -oL evtest
  /dev/input/by-path/$ARMADA_HUD_CYCLE_BUTTON_DEV` piped to a line-buffered
  match on `$ARMADA_HUD_CYCLE_BUTTON_KEY ... value 1` (the
  `nested-refresh-bridge` xprop pattern), running `hud-cycle` once per
  key-down.
- The device is read passively (no `EVIOCGRAB`): volume-up on the same
  device keeps working, and F24 also propagates to the focused game via
  KWin → nested gamescope. Accepted: games do not bind F24.

New vars in `ayn-thor.conf` (absent from `defaults.conf`):

```
ARMADA_HUD_CYCLE_BUTTON_DEV=platform-gpio-keys-event
ARMADA_HUD_CYCLE_BUTTON_KEY=KEY_F24
```

### 2. Cycle script — `/usr/libexec/armada/hud-cycle`

```
armada-nested-gaming.service active?   no → exit 0
armada-hud-top active?     → systemctl --user start armada-hud-bottom   (Conflicts stops top)
armada-hud-bottom active?  → systemctl --user stop  armada-hud-bottom   (→ off)
neither                    → systemctl --user start armada-hud-top
```

### 3. `armada-hud-top.service`

Extracts the inline mangoapp restart-loop from `nested-gaming`:

- `nested-gaming` writes `DISPLAY` (nested Xwayland) and
  `MANGOHUD_CONFIGFILE` (the Steam-rewritten tmpfile) to
  `$XDG_RUNTIME_DIR/armada-nested-gaming.env` after the gamescope
  handshake, then starts this unit instead of spawning mangoapp itself.
- Unit: `EnvironmentFile=%t/armada-nested-gaming.env`, `Restart=always`,
  `RestartSec=1`, `PartOf=armada-nested-gaming.service`,
  `After=armada-nested-gaming.service`,
  `Conflicts=armada-hud-bottom.service`.
- `nested-gaming` starts it with `reset-failed` first (start-limit hygiene,
  same as the callers of `armada-nested-gaming.service`).

### 4. `armada-hud-bottom.service` + `/usr/libexec/armada/hud-bottom`

- Script: unsets `WAYLAND_DISPLAY` so mangoapp's GLFW lands on the desktop
  session's Xwayland (mirrors commit 3d56b1a's X11-forcing rationale), sets
  `MANGOHUD_CONFIGFILE=/usr/share/armada/mangohud-bottom.conf`, execs
  `mangoapp`. `DISPLAY` comes from the user manager environment (Plasma
  imports it).
- Unit: `Restart=always`, `RestartSec=1`,
  `PartOf=armada-nested-gaming.service`, `After=graphical-session.target`,
  `Conflicts=armada-hud-top.service`.
- `Conflicts=` is declared in both HUD units for self-documentation;
  systemd enforces it from either side.

### 5. Bottom HUD config — `/usr/share/armada/mangohud-bottom.conf`

Full-stats layout sized for the 1080×1240 bottom panel: FPS + frametime
graph, CPU/GPU load, clocks and temperatures, RAM/VRAM, battery, large
font, opaque-ish background for readability. Static, read-only, never
touched by Steam. Exact parameter values are tuned on-device during
validation.

### 6. KWin window rule — extend `/etc/xdg/kwinrulesrc`

New rule matching mangoapp's window class: force fullscreen on the bottom
output, keep above, skip taskbar (pattern of the existing `steam-keyboard`
rule). Whether output pinning uses an output rule key or forced geometry at
the bottom screen's logical coordinates (226,720) is decided on-device.

## Edge cases

- **Steam client-update restart:** `armada-nested-gaming.service` restarts;
  `PartOf` restarts `armada-hud-top` (possibly against a stale env file).
  mangoapp fails to connect to the dead display and `Restart=always`
  retries until `nested-gaming` rewrites the env file after the new
  handshake. Self-healing; state resets to `top`.
- **Leaving gaming mode:** both HUD units are `PartOf=armada-nested-gaming.service`
  and stop with it; the listener stays up but `hud-cycle` gates on the
  gaming unit, so desktop-mode presses are no-ops.
- **Bottom HUD with no game running:** gamescope still emits frame stats
  for the Steam UI; the HUD shows those numbers. Fine.
- **Rapid presses:** `hud-cycle` is a few fast `systemctl` calls run
  synchronously in the listener loop; queued presses apply in order.
- **Other devices:** button vars unset → listener exits 0; HUD units exist
  but nothing starts them (`hud-cycle` is only reachable via the listener,
  and `nested-gaming` starting `armada-hud-top` preserves today's behavior
  everywhere `ARMADA_GAMING_SESSION=nested`).

## Design risks (validate first on-device)

1. mangoapp as a regular KWin client: it is built to be a gamescope overlay
   (transparent X11 window + gamescope-specific atoms KWin ignores).
   Expected to render as a normal transparent window we force fullscreen;
   must be confirmed before the rest is wired up.
2. KWin rule mechanics for pinning to the bottom output (rule key vs
   forced geometry).

## Validation plan

On-device via the established shim workflow (bind-mounted scripts,
user-unit overrides), then a baked image:

1. mangoapp renders sanely under KWin and the rule pins it to DSI-1.
2. Full cycle during a real game: FPS correct in both positions (no
   halved/garbage stats), Steam slider still works in `top` state.
3. Mode switches and a Steam client-update restart clean up and reset to
   `top`.
4. Volume-up unaffected; F24 causes no visible effect in-game.
