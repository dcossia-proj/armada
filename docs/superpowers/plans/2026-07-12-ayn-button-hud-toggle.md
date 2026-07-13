# AYN Button HUD Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing the Thor's AYN button (KEY_F24 on gpio-keys) toggles the MangoHud performance overlay between the top-screen nested-gamescope overlay (Steam-controlled, today's behavior) and a fullscreen full-stats HUD on the bottom screen.

**Architecture:** Two mutually exclusive systemd user units (`armada-hud-top.service`, `armada-hud-bottom.service`, `Conflicts=` each other) each run one mangoapp instance — gamescope feeds mangoapp over a single-consumer SysV message queue, so systemd enforces the one-consumer rule. A passive evdev listener user unit runs `/usr/libexec/armada/hud-toggle` on each button press. State is simply which unit is active; every gaming session starts in `top`.

**Tech Stack:** bash, systemd user units, evtest, mangoapp/MangoHud, KWin window rules.

**Spec:** `docs/superpowers/specs/2026-07-12-ayn-button-hud-toggle-design.md`

## Global Constraints

- All scripts: `#!/usr/bin/bash` + `set -euo pipefail` (repo convention).
- New executables live in `system_files/usr/libexec/armada/` and must be `chmod +x` before `git add`.
- New user units live in `system_files/usr/lib/systemd/user/`; nothing preset-enables them — they are started explicitly (repo convention).
- Device vars must be added in three places or `device-env` silently drops them: `devices/defaults.conf`, `devices/ayn-thor.conf`, and the `vars=(...)` array in `device-env`.
- Exact var names: `ARMADA_HUD_TOGGLE_BUTTON_DEV=platform-gpio-keys-event`, `ARMADA_HUD_TOGGLE_BUTTON_KEY=KEY_F24` (Thor values).
- Exact unit names: `armada-hud-top.service`, `armada-hud-bottom.service`, `armada-ayn-button.service`.
- Tests are contract tests (repo pattern, see `tests/test-nested-gaming-mangoapp.sh`): `bash -n` the scripts, `grep -Fq` for load-bearing literals. Run with `bash tests/<file>.sh`; success is silent exit 0.
- Commit after every task. Commit message footer (required by the session harness):

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018YYLGYK7FVvW3jP7WVrNjg
  ```

---

### Task 1: HUD-toggle button device variables

**Files:**
- Modify: `system_files/usr/lib/armada/devices/defaults.conf`
- Modify: `system_files/usr/lib/armada/devices/ayn-thor.conf`
- Modify: `system_files/usr/libexec/armada/device-env` (the `vars=(...)` array, around line 36-55)
- Test: `tests/test-hud-toggle.sh` (create)

**Interfaces:**
- Produces: `ARMADA_HUD_TOGGLE_BUTTON_DEV` and `ARMADA_HUD_TOGGLE_BUTTON_KEY` in `eval "$(/usr/libexec/armada/device-env)"` output — consumed by Task 5's listener. Also the `require()` helper and path variables (`sf`, `devices`, `libexec`, `units`) in `tests/test-hud-toggle.sh` — later tasks append to this file.

- [ ] **Step 1: Write the failing test**

Create `tests/test-hud-toggle.sh` with exactly:

```bash
#!/usr/bin/bash
# Contract tests for the AYN-button HUD toggle (see
# docs/superpowers/specs/2026-07-12-ayn-button-hud-toggle-design.md).
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
sf="${repo_root}/system_files"
devices="${sf}/usr/lib/armada/devices"
libexec="${sf}/usr/libexec/armada"
units="${sf}/usr/lib/systemd/user"

require() {
    local file=$1 contract=$2 literal=$3
    grep -Fq -- "$literal" "$file" || {
        printf 'missing HUD-toggle contract (%s): %s\n' "${file##*/}" "$contract" >&2
        exit 1
    }
}

# --- device configuration ---
require "$devices/defaults.conf" 'button device has a documented default' 'ARMADA_HUD_TOGGLE_BUTTON_DEV='
require "$devices/defaults.conf" 'button key has a documented default' 'ARMADA_HUD_TOGGLE_BUTTON_KEY='
require "$devices/ayn-thor.conf" 'Thor names the AYN button device' 'ARMADA_HUD_TOGGLE_BUTTON_DEV=platform-gpio-keys-event'
require "$devices/ayn-thor.conf" 'Thor names the AYN button key' 'ARMADA_HUD_TOGGLE_BUTTON_KEY=KEY_F24'
require "$libexec/device-env" 'device-env exports the button device' 'ARMADA_HUD_TOGGLE_BUTTON_DEV'
require "$libexec/device-env" 'device-env exports the button key' 'ARMADA_HUD_TOGGLE_BUTTON_KEY'
```

Then: `chmod +x tests/test-hud-toggle.sh`

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/test-hud-toggle.sh`
Expected: exit 1, `missing HUD-toggle contract (defaults.conf): button device has a documented default`

- [ ] **Step 3: Add the vars**

In `system_files/usr/lib/armada/devices/defaults.conf`, after the `ARMADA_GAMEPAD_QUIRK=none` line, add:

```
# Physical HUD-toggle button (the AYN button on the Thor): input device name
# under /dev/input/by-path/ plus the key name evtest reports. Unset disables
# the armada-ayn-button listener; see hud-toggle-listener.
ARMADA_HUD_TOGGLE_BUTTON_DEV=
ARMADA_HUD_TOGGLE_BUTTON_KEY=
```

In `system_files/usr/lib/armada/devices/ayn-thor.conf`, append at the end:

```
# The AYN button swaps the performance HUD between the screens.
ARMADA_HUD_TOGGLE_BUTTON_DEV=platform-gpio-keys-event
ARMADA_HUD_TOGGLE_BUTTON_KEY=KEY_F24
```

In `system_files/usr/libexec/armada/device-env`, in the `vars=(...)` array, add after the `ARMADA_GAMEPAD_QUIRK` line:

```
    ARMADA_HUD_TOGGLE_BUTTON_DEV
    ARMADA_HUD_TOGGLE_BUTTON_KEY
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash tests/test-hud-toggle.sh && bash -n system_files/usr/libexec/armada/device-env && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add tests/test-hud-toggle.sh system_files/usr/lib/armada/devices/defaults.conf system_files/usr/lib/armada/devices/ayn-thor.conf system_files/usr/libexec/armada/device-env
git commit -m "Add HUD-toggle button device vars for the AYN Thor"
```

---

### Task 2: Extract the top-screen MangoApp into armada-hud-top.service

**Files:**
- Create: `system_files/usr/libexec/armada/hud-top`
- Create: `system_files/usr/lib/systemd/user/armada-hud-top.service`
- Modify: `system_files/usr/libexec/armada/nested-gaming` (config-file block ~line 30, trap ~line 65, mangoapp loop ~lines 84-93)
- Modify: `tests/test-nested-gaming-mangoapp.sh`
- Test: `tests/test-hud-toggle.sh` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `armada-hud-top.service` (started by nested-gaming and by Task 4's `hud-toggle`; `Conflicts=armada-hud-bottom.service`), and the env file `$XDG_RUNTIME_DIR/armada-nested-gaming.env` containing `DISPLAY=<nested X display>` and `MANGOHUD_CONFIGFILE=<Steam-managed tmpfile>` lines, written by `nested-gaming` after its gamescope handshake.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test-hud-toggle.sh`:

```bash
# --- top HUD unit (Steam-controlled overlay inside nested gamescope) ---
bash -n "$libexec/hud-top"
require "$units/armada-hud-top.service" 'top HUD conflicts with the bottom HUD' 'Conflicts=armada-hud-bottom.service'
require "$units/armada-hud-top.service" 'top HUD dies with gaming mode' 'PartOf=armada-nested-gaming.service'
require "$units/armada-hud-top.service" 'top HUD is supervised' 'Restart=always'
require "$units/armada-hud-top.service" 'top HUD retries forever like the old loop' 'StartLimitIntervalSec=0'
require "$libexec/hud-top" 'top HUD reads the session env file' 'armada-nested-gaming.env'
require "$libexec/hud-top" 'top HUD refuses to run without the nested display' '[[ -n ${DISPLAY:-} && -n ${MANGOHUD_CONFIGFILE:-} ]] || exit 1'
require "$libexec/hud-top" 'top HUD avoids the host compositor' 'unset WAYLAND_DISPLAY'
require "$libexec/hud-top" 'top HUD runs mangoapp' 'exec mangoapp'
```

In `tests/test-nested-gaming-mangoapp.sh`, replace these four contracts:

```bash
# shellcheck disable=SC2016
require 'session removes the private MangoHud config' 'trap '\''rm -f -- "$socket" "$MANGOHUD_CONFIGFILE"'\'' EXIT'
require 'MangoApp is supervised' 'while true; do'
require 'MangoApp failures do not defeat supervision' 'mangoapp || true'
require 'MangoApp restart is rate limited' 'sleep 1'
```

with:

```bash
# shellcheck disable=SC2016
require 'session removes its runtime files' 'trap '\''rm -f -- "$socket" "$MANGOHUD_CONFIGFILE" "$hud_env"'\'' EXIT'
# shellcheck disable=SC2016
require 'session hands the HUD unit its config' 'printf '\''MANGOHUD_CONFIGFILE=%s\n'\'' "$MANGOHUD_CONFIGFILE"'
require 'session starts the top HUD unit' 'systemctl --user start --no-block armada-hud-top.service'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/test-hud-toggle.sh; bash tests/test-nested-gaming-mangoapp.sh`
Expected: first fails with `bash: .../hud-top: No such file or directory`; second fails with `missing MangoApp contract: session removes its runtime files`

- [ ] **Step 3: Create the hud-top script**

Create `system_files/usr/libexec/armada/hud-top`:

```bash
#!/usr/bin/bash
# MangoApp overlay inside the nested gamescope (top screen); Steam's
# performance-overlay slider drives it by rewriting MANGOHUD_CONFIGFILE.
# nested-gaming writes the nested DISPLAY and that config path to the env
# file after its gamescope handshake. Refusing to run without the file
# matters: the user manager has the desktop DISPLAY in its environment, and
# mangoapp there would still steal gamescope's stats queue. Supervision is
# armada-hud-top.service (Restart=always).
set -euo pipefail

env_file="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/armada-nested-gaming.env"
[[ -r $env_file ]] || exit 1
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a
[[ -n ${DISPLAY:-} && -n ${MANGOHUD_CONFIGFILE:-} ]] || exit 1

# Target the nested Xwayland, never the host compositor.
export XDG_SESSION_TYPE=x11
unset WAYLAND_DISPLAY

exec mangoapp
```

Then: `chmod +x system_files/usr/libexec/armada/hud-top`

- [ ] **Step 4: Create the unit**

Create `system_files/usr/lib/systemd/user/armada-hud-top.service`:

```ini
[Unit]
Description=Performance overlay inside nested gamescope (top screen)
# gamescope feeds mangoapp over a single-consumer message queue; Conflicts
# lets systemd guarantee only one HUD unit ever runs (hud-toggle swaps them).
Conflicts=armada-hud-bottom.service
# Started by nested-gaming after its gamescope handshake; dies with it.
PartOf=armada-nested-gaming.service
After=armada-nested-gaming.service
# mangoapp exits immediately while gamescope is restarting (dead display);
# retry forever, as the old inline restart-loop did.
StartLimitIntervalSec=0

[Service]
ExecStart=/usr/libexec/armada/hud-top
Restart=always
RestartSec=1
```

- [ ] **Step 5: Rewire nested-gaming**

In `system_files/usr/libexec/armada/nested-gaming`:

(a) After the `echo "no_display" >"$MANGOHUD_CONFIGFILE"` line, add:

```bash
# Handed to armada-hud-top.service once gamescope is up (see hud-top).
hud_env="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/armada-nested-gaming.env"
```

(b) Change the trap line from:

```bash
trap 'rm -f -- "$socket" "$MANGOHUD_CONFIGFILE"' EXIT
```

to:

```bash
trap 'rm -f -- "$socket" "$MANGOHUD_CONFIGFILE" "$hud_env"' EXIT
```

(c) Replace the whole mangoapp block:

```bash
# MangoApp must target Gamescope's nested Xwayland. Restart it if it exits so
# one overlay failure does not require restarting Steam or Gamescope.
if command -v mangoapp >/dev/null; then
    (
        while true; do
            mangoapp || true
            sleep 1
        done
    ) &
fi
```

with:

```bash
# The top-screen MangoApp runs as armada-hud-top.service so the AYN-button
# HUD toggle can swap it for the bottom-screen HUD (the units Conflict).
# Hand it the nested display and the Steam-managed config; starting it here
# also resets the toggle to the top overlay on every session start.
{
    printf 'DISPLAY=%s\n' "$x_display"
    printf 'MANGOHUD_CONFIGFILE=%s\n' "$MANGOHUD_CONFIGFILE"
} >"$hud_env"
if command -v mangoapp >/dev/null; then
    systemctl --user reset-failed armada-hud-top.service 2>/dev/null || true
    systemctl --user start --no-block armada-hud-top.service 2>/dev/null || true
fi
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bash tests/test-hud-toggle.sh && bash tests/test-nested-gaming-mangoapp.sh && bash -n system_files/usr/libexec/armada/nested-gaming && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add system_files/usr/libexec/armada/hud-top system_files/usr/lib/systemd/user/armada-hud-top.service system_files/usr/libexec/armada/nested-gaming tests/test-hud-toggle.sh tests/test-nested-gaming-mangoapp.sh
git commit -m "nested-gaming: run the top MangoApp as armada-hud-top.service"
```

---

### Task 3: Bottom-screen full-stats HUD

**Files:**
- Create: `system_files/usr/libexec/armada/hud-bottom`
- Create: `system_files/usr/lib/systemd/user/armada-hud-bottom.service`
- Create: `system_files/usr/share/armada/mangohud-bottom.conf`
- Modify: `system_files/etc/xdg/kwinrulesrc`
- Test: `tests/test-hud-toggle.sh` (append)

**Interfaces:**
- Consumes: `armada-hud-top.service` name (for `Conflicts=`).
- Produces: `armada-hud-bottom.service` — started/stopped by Task 4's `hud-toggle`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test-hud-toggle.sh`:

```bash
forbid() {
    local file=$1 contract=$2 literal=$3
    ! grep -Fq -- "$literal" "$file" || {
        printf 'violated HUD-toggle contract (%s): %s\n' "${file##*/}" "$contract" >&2
        exit 1
    }
}

# --- bottom HUD unit (full stats on the desktop's bottom screen) ---
bash -n "$libexec/hud-bottom"
require "$units/armada-hud-bottom.service" 'bottom HUD conflicts with the top HUD' 'Conflicts=armada-hud-top.service'
require "$units/armada-hud-bottom.service" 'bottom HUD dies with gaming mode' 'PartOf=armada-nested-gaming.service'
require "$units/armada-hud-bottom.service" 'bottom HUD is supervised' 'Restart=always'
require "$libexec/hud-bottom" 'bottom HUD needs the desktop display' '[[ -n ${DISPLAY:-} ]] || exit 1'
require "$libexec/hud-bottom" 'bottom HUD avoids the host compositor' 'unset WAYLAND_DISPLAY'
require "$libexec/hud-bottom" 'bottom HUD uses the static config' 'MANGOHUD_CONFIGFILE=/usr/share/armada/mangohud-bottom.conf'
require "$libexec/hud-bottom" 'bottom HUD runs mangoapp' 'exec mangoapp'
require "${sf}/usr/share/armada/mangohud-bottom.conf" 'bottom HUD shows fps' 'fps'
require "${sf}/usr/share/armada/mangohud-bottom.conf" 'bottom HUD shows the frametime graph' 'frame_timing'
forbid "${sf}/usr/share/armada/mangohud-bottom.conf" 'bottom HUD must never start hidden' 'no_display'
require "${sf}/etc/xdg/kwinrulesrc" 'HUD window rule is registered' 'rules=steam-keyboard,armada-hud-bottom'
require "${sf}/etc/xdg/kwinrulesrc" 'HUD window is matched by class' 'wmclass=mangoapp'
require "${sf}/etc/xdg/kwinrulesrc" 'HUD window is forced fullscreen' 'fullscreenrule=2'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/test-hud-toggle.sh`
Expected: fails with `bash: .../hud-bottom: No such file or directory`

- [ ] **Step 3: Create the hud-bottom script**

Create `system_files/usr/libexec/armada/hud-bottom`:

```bash
#!/usr/bin/bash
# Full-stats MangoApp on the desktop session (the Thor's bottom screen). It
# reads the same gamescope stats queue as the top overlay; the two units
# Conflict so only one consumer ever runs. Placement is the armada-hud-bottom
# KWin rule; supervision is armada-hud-bottom.service (Restart=always).
set -euo pipefail

# The desktop DISPLAY comes from the user manager environment (imported by
# desktop-bootstrap); without it there is nowhere to draw yet.
[[ -n ${DISPLAY:-} ]] || exit 1

# Land on the desktop Xwayland: GLFW would pick host Wayland otherwise, and
# mangoapp's window hints are X11-only.
export XDG_SESSION_TYPE=x11
unset WAYLAND_DISPLAY

export MANGOHUD_CONFIGFILE=/usr/share/armada/mangohud-bottom.conf
exec mangoapp
```

Then: `chmod +x system_files/usr/libexec/armada/hud-bottom`

- [ ] **Step 4: Create the unit and the HUD config**

Create `system_files/usr/lib/systemd/user/armada-hud-bottom.service`:

```ini
[Unit]
Description=Full-stats performance HUD on the bottom screen
# gamescope feeds mangoapp over a single-consumer message queue; Conflicts
# lets systemd guarantee only one HUD unit ever runs (hud-toggle swaps them).
Conflicts=armada-hud-top.service
# Only hud-toggle (the AYN button) starts this; it dies with gaming mode.
PartOf=armada-nested-gaming.service
After=graphical-session.target
StartLimitIntervalSec=0

[Service]
ExecStart=/usr/libexec/armada/hud-bottom
Restart=always
RestartSec=1
```

Create `system_files/usr/share/armada/mangohud-bottom.conf`:

```
# Full-stats HUD for the bottom screen (armada-hud-bottom.service). Static:
# Steam never rewrites this file; the AYN button controls visibility by
# starting/stopping the unit. Sized for the Thor's bottom panel (1080x1240
# shown rotated at 1.5x scale); values tuned on-device.
table_columns=3
font_size=32
background_alpha=0.8
position=top-left

fps
frametime
frame_timing
cpu_stats
cpu_mhz
cpu_temp
core_load
gpu_stats
gpu_core_clock
gpu_temp
ram
battery
battery_watt
```

- [ ] **Step 5: Add the KWin rule**

Replace the full contents of `system_files/etc/xdg/kwinrulesrc` with:

```ini
[General]
count=2
rules=steam-keyboard,armada-hud-bottom

[armada-hud-bottom]
Description=Pin the bottom-screen HUD fullscreen on the secondary output
above=true
aboverule=2
fullscreen=true
fullscreenrule=2
screen=1
screenrule=2
skiptaskbar=true
skiptaskbarrule=2
wmclass=mangoapp
wmclasscomplete=false
wmclassmatch=1

[steam-keyboard]
Description=Window settings for Steam Keyboard
above=true
aboverule=2
acceptfocusrule=2
skiptaskbar=true
skiptaskbarrule=2
title=Steam Keyboard
types=256
typerule=2
wmclass=steamwebhelper steam
wmclasscomplete=true
wmclassmatch=2
```

Note: `screen=1` (the secondary output index) and `wmclass=mangoapp` are the two design-risk guesses; the on-device task (Task 6) verifies both and this file is where they get corrected (fallback: forced geometry `position=226,720` + `positionrule=2`, per the spec).

- [ ] **Step 6: Run tests to verify they pass**

Run: `bash tests/test-hud-toggle.sh && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add system_files/usr/libexec/armada/hud-bottom system_files/usr/lib/systemd/user/armada-hud-bottom.service system_files/usr/share/armada/mangohud-bottom.conf system_files/etc/xdg/kwinrulesrc tests/test-hud-toggle.sh
git commit -m "Add the bottom-screen full-stats HUD unit"
```

---

### Task 4: hud-toggle script

**Files:**
- Create: `system_files/usr/libexec/armada/hud-toggle`
- Test: `tests/test-hud-toggle.sh` (append)

**Interfaces:**
- Consumes: `armada-hud-top.service`, `armada-hud-bottom.service`, `armada-nested-gaming.service` unit names.
- Produces: `/usr/libexec/armada/hud-toggle` — executed by Task 5's listener, no arguments, exit 0 when gaming mode is inactive.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test-hud-toggle.sh`:

```bash
# --- toggle action ---
bash -n "$libexec/hud-toggle"
require "$libexec/hud-toggle" 'toggle is gated on gaming mode' 'is-active armada-nested-gaming.service || exit 0'
require "$libexec/hud-toggle" 'bottom toggles back to top' 'unit=armada-hud-top.service'
require "$libexec/hud-toggle" 'anything else lands on bottom' 'unit=armada-hud-bottom.service'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/test-hud-toggle.sh`
Expected: fails with `bash: .../hud-toggle: No such file or directory`

- [ ] **Step 3: Create the script**

Create `system_files/usr/libexec/armada/hud-toggle`:

```bash
#!/usr/bin/bash
# AYN-button action: swap the performance HUD between the nested-gamescope
# overlay (top screen, Steam's slider in control) and the bottom-screen
# full-stats HUD. State is simply which unit is active; Conflicts= in the
# units stops the other side, keeping gamescope's stats queue
# single-consumer.
set -euo pipefail

# The HUDs only mean something while gaming mode is up.
systemctl --user --quiet is-active armada-nested-gaming.service || exit 0

if systemctl --user --quiet is-active armada-hud-bottom.service; then
    unit=armada-hud-top.service
else
    # Covers top-active and the transient neither-active (mid Steam
    # restart): both land on bottom, the state the press is asking for.
    unit=armada-hud-bottom.service
fi

systemctl --user reset-failed "$unit" 2>/dev/null || true
exec systemctl --user start "$unit"
```

Then: `chmod +x system_files/usr/libexec/armada/hud-toggle`

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash tests/test-hud-toggle.sh && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add system_files/usr/libexec/armada/hud-toggle tests/test-hud-toggle.sh
git commit -m "Add hud-toggle to swap the HUD between screens"
```

---

### Task 5: AYN button listener

**Files:**
- Create: `system_files/usr/libexec/armada/hud-toggle-listener`
- Create: `system_files/usr/lib/systemd/user/armada-ayn-button.service`
- Modify: `system_files/usr/libexec/armada/desktop-bootstrap` (the `ARMADA_GAMING_SESSION == nested` block, ~lines 36-39)
- Test: `tests/test-hud-toggle.sh` (append)

**Interfaces:**
- Consumes: `ARMADA_HUD_TOGGLE_BUTTON_DEV`/`_KEY` from `device-env` (Task 1); `/usr/libexec/armada/hud-toggle` (Task 4).
- Produces: `armada-ayn-button.service`, started by desktop-bootstrap.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test-hud-toggle.sh`:

```bash
# --- button listener ---
bash -n "$libexec/hud-toggle-listener"
require "$libexec/hud-toggle-listener" 'listener is inert without a configured button' '|| exit 0'
require "$libexec/hud-toggle-listener" 'listener reads the device by stable path' '/dev/input/by-path/${ARMADA_HUD_TOGGLE_BUTTON_DEV}'
require "$libexec/hud-toggle-listener" 'evtest output is line-buffered' 'stdbuf -oL evtest'
require "$libexec/hud-toggle-listener" 'a press runs the toggle' '/usr/libexec/armada/hud-toggle || true'
require "$units/armada-ayn-button.service" 'listener lives with the session' 'PartOf=graphical-session.target'
require "$units/armada-ayn-button.service" 'clean no-button exit is final' 'Restart=on-failure'
require "$libexec/desktop-bootstrap" 'listener is started at desktop login' 'systemctl --user start armada-ayn-button.service'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/test-hud-toggle.sh`
Expected: fails with `bash: .../hud-toggle-listener: No such file or directory`

- [ ] **Step 3: Create the listener script**

Create `system_files/usr/libexec/armada/hud-toggle-listener`:

```bash
#!/usr/bin/bash
# Watch the device's HUD-toggle button (the AYN button on the Thor) and run
# hud-toggle on each press. Purely passive: no evdev grab, so other keys on
# the same device (volume-up shares gpio-keys) keep working. The keycode
# also still reaches the focused client; harmless for F24-class keys.
set -euo pipefail

eval "$(/usr/libexec/armada/device-env)"

[[ -n ${ARMADA_HUD_TOGGLE_BUTTON_DEV:-} && -n ${ARMADA_HUD_TOGGLE_BUTTON_KEY:-} ]] || exit 0

dev="/dev/input/by-path/${ARMADA_HUD_TOGGLE_BUTTON_DEV}"
# Tolerate udev still settling at session start.
for _ in $(seq 1 30); do
    [[ -e $dev ]] && break
    sleep 1
done
[[ -e $dev ]] || exit 1

# stdbuf: evtest block-buffers when piped, which would delay presses forever.
# Key-down lines look like:
#   Event: time 1783912432.241849, type 1 (EV_KEY), code 194 (KEY_F24), value 1
stdbuf -oL evtest "$dev" \
    | while read -r line; do
          case "$line" in
              *"(${ARMADA_HUD_TOGGLE_BUTTON_KEY}), value 1")
                  /usr/libexec/armada/hud-toggle || true
                  ;;
          esac
      done
```

Then: `chmod +x system_files/usr/libexec/armada/hud-toggle-listener`

- [ ] **Step 4: Create the unit and start it from desktop-bootstrap**

Create `system_files/usr/lib/systemd/user/armada-ayn-button.service`:

```ini
[Unit]
Description=HUD-toggle button listener (AYN button)
PartOf=graphical-session.target
After=graphical-session.target

[Service]
ExecStart=/usr/libexec/armada/hud-toggle-listener
# The listener exits 0 on devices without a configured button; on-failure
# keeps that final while restarting real failures (e.g. evtest dying).
Restart=on-failure
RestartSec=5
```

In `system_files/usr/libexec/armada/desktop-bootstrap`, extend the nested block:

```bash
if [[ ${ARMADA_GAMING_SESSION:-} == nested ]]; then
    systemctl --user reset-failed armada-nested-gaming.service 2>/dev/null || true
    systemctl --user start armada-nested-gaming.service 2>/dev/null || true
    # The AYN-button HUD toggle only applies to nested gaming; the listener
    # exits on its own unless the device conf names a button.
    systemctl --user start armada-ayn-button.service 2>/dev/null || true
fi
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash tests/test-hud-toggle.sh && bash -n system_files/usr/libexec/armada/desktop-bootstrap && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add system_files/usr/libexec/armada/hud-toggle-listener system_files/usr/lib/systemd/user/armada-ayn-button.service system_files/usr/libexec/armada/desktop-bootstrap tests/test-hud-toggle.sh
git commit -m "Listen for the AYN button and toggle the HUD"
```

---

### Task 6: Full-suite verification and on-device validation

**Files:**
- No new files. Runs checks; on-device fixes land in the files from Tasks 2-3 if the design-risk guesses were wrong.

**Interfaces:**
- Consumes: everything above.
- Produces: hardware-validated feature.

- [ ] **Step 1: Run the full local suite**

```bash
for t in tests/*.sh; do bash "$t" || exit 1; done
shellcheck system_files/usr/libexec/armada/hud-top system_files/usr/libexec/armada/hud-bottom system_files/usr/libexec/armada/hud-toggle system_files/usr/libexec/armada/hud-toggle-listener system_files/usr/libexec/armada/nested-gaming
```

Expected: tests silent; shellcheck may emit SC1091 (not following sourced files) — acceptable; fix anything else it reports.

- [ ] **Step 2: Deploy shims to the Thor** (manual, device at `ssh armada@192.168.86.35`; follows the established shim workflow — see the `apply-poc-shims.sh` precedent on-device)

`/usr` is immutable (ostree): existing files can be bind-mounted over, but the four new libexec scripts have no path to mount onto — the shim copies run from `/var/home/armada/hud-test/` instead, so the shimmed callers must reference those paths.

```bash
ssh armada@192.168.86.35 'mkdir -p ~/hud-test'
scp system_files/usr/libexec/armada/{hud-top,hud-bottom,hud-toggle,hud-toggle-listener,nested-gaming,device-env} \
    system_files/usr/lib/armada/devices/{defaults.conf,ayn-thor.conf} \
    system_files/usr/lib/systemd/user/{armada-hud-top.service,armada-hud-bottom.service,armada-ayn-button.service} \
    system_files/usr/share/armada/mangohud-bottom.conf \
    armada@192.168.86.35:hud-test/
```

Then, on the device:

1. Edit the shim copies to use shim paths: in `~/hud-test/nested-gaming` and `~/hud-test/hud-toggle-listener`, replace `/usr/libexec/armada/hud-` with `/var/home/armada/hud-test/hud-`; in `~/hud-test/hud-bottom`, point `MANGOHUD_CONFIGFILE` at `/var/home/armada/hud-test/mangohud-bottom.conf`; in the three `~/hud-test/*.service` files, point `ExecStart=` at `/var/home/armada/hud-test/<script>`. `chmod +x ~/hud-test/hud-*`.
2. Bind-mount the files that do exist in the image:

```bash
sudo mount --bind ~/hud-test/nested-gaming /usr/libexec/armada/nested-gaming
sudo mount --bind ~/hud-test/device-env /usr/libexec/armada/device-env
sudo mount --bind ~/hud-test/defaults.conf /usr/lib/armada/devices/defaults.conf
sudo mount --bind ~/hud-test/ayn-thor.conf /usr/lib/armada/devices/ayn-thor.conf
```

3. Install the user units (user dir shadows `/usr/lib/systemd/user`) and the KWin rule (user file wins over `/etc/xdg`):

```bash
mkdir -p ~/.config/systemd/user
cp ~/hud-test/armada-hud-top.service ~/hud-test/armada-hud-bottom.service ~/hud-test/armada-ayn-button.service ~/.config/systemd/user/
systemctl --user daemon-reload
# append the [armada-hud-bottom] rule section to ~/.config/kwinrulesrc, bump
# its [General] count/rules accordingly, then:
qdbus6 org.kde.KWin /KWin reconfigure
```

- [ ] **Step 3: Validate on hardware** (manual, with the user; from the spec's validation plan)

1. `systemctl --user restart armada-nested-gaming.service`, launch a game.
2. Verify the top overlay behaves as before (Steam slider shows/hides/levels it).
3. Run `~/hud-test/hud-toggle` over SSH: bottom HUD appears fullscreen on the bottom panel, top overlay gone, FPS plausible (not halved/garbage). Verify `xprop` window class is really `mangoapp` and the KWin rule caught it; fix `wmclass`/`screen` in `system_files/etc/xdg/kwinrulesrc` if not.
4. Press the AYN button: HUD returns to top. Press again: back to bottom. Confirm volume-up still works and the game shows no reaction to F24.
5. Switch to desktop mode: all three HUD units stop (`systemctl --user status armada-hud-{top,bottom} armada-ayn-button`); AYN presses do nothing. Switch back: state is top.
6. Kill Steam (client-update simulation: `pkill -x steam`): session restarts, HUD comes back on top, no unit in failed state.
7. Tune `mangohud-bottom.conf` values (font_size, columns, params that read zero on Adreno) until readable; copy final values back into the repo file.

- [ ] **Step 4: Commit any on-device corrections**

```bash
git add system_files/etc/xdg/kwinrulesrc system_files/usr/share/armada/mangohud-bottom.conf
git commit -m "Tune the bottom HUD rule and layout from on-device validation"
```

(Skip if nothing changed.)
