# Nested Gaming MangoApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Steam's performance overlay in the dual-screen nested gaming session by starting MangoApp with the same session contract as `gamescope-session-plus`.

**Architecture:** The existing `nested-gaming` launcher remains the lifecycle owner for Gamescope, MangoApp, and Steam. It will advertise MangoApp support before Steam starts, create a private initially-hidden MangoHud config, and run MangoApp after Gamescope supplies the nested display names. A shell contract test locks down those integration points without requiring a compositor in CI.

**Tech Stack:** Bash, systemd user services, Gamescope, MangoHud/MangoApp, Steam for Linux ARM64

## Global Constraints

- Make the durable change directly on `thor-nested-gaming`.
- Match the MangoApp behavior already shipped by `gamescope-session-plus`.
- Do not modify embedded Gamescope sessions, game-specific launch options, packages, or refresh-rate bridging.
- Preserve unrelated untracked files under `docs/` and `hack/`.

---

### Task 1: Add the nested-session MangoApp contract

**Files:**
- Create: `tests/test-nested-gaming-mangoapp.sh`
- Modify: `system_files/usr/libexec/armada/nested-gaming`

**Interfaces:**
- Consumes: Gamescope readiness values `x_display` and `wl_display`; the installed `mangoapp` command; Steam's `MANGOHUD_CONFIGFILE` control protocol.
- Produces: Steam environment flags for MangoApp support, a session-private initially-hidden MangoHud config, and a supervised MangoApp process using the nested display.

- [ ] **Step 1: Write the failing contract test**

```bash
#!/usr/bin/bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
launcher="${repo_root}/system_files/usr/libexec/armada/nested-gaming"
bash -n "$launcher"

require() {
    local contract=$1 literal=$2
    grep -Fq -- "$literal" "$launcher" || {
        printf 'missing MangoApp contract: %s\n' "$contract" >&2
        exit 1
    }
}

require 'Steam uses MangoApp' 'export STEAM_USE_MANGOAPP=1'
require 'Steam exposes MangoApp presets' 'export STEAM_MANGOAPP_PRESETS_SUPPORTED=1'
require 'Steam exposes horizontal MangoApp' 'export STEAM_MANGOAPP_HORIZONTAL_SUPPORTED=1'
require 'Steam uses MangoApp overlay property handling' 'export STEAM_DISABLE_MANGOAPP_ATOM_WORKAROUND=1'
require 'session exports a private MangoHud config' 'export MANGOHUD_CONFIGFILE=$(mktemp /tmp/mangohud.XXXXXXXX)'
require 'MangoApp starts hidden' 'echo "no_display" >"$MANGOHUD_CONFIGFILE"'
require 'MangoApp is supervised' 'while true; do'
require 'MangoApp is launched' 'mangoapp'
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
chmod +x tests/test-nested-gaming-mangoapp.sh
tests/test-nested-gaming-mangoapp.sh
```

Expected: exit 1 with `missing MangoApp contract: Steam uses MangoApp`.

- [ ] **Step 3: Add the minimal session integration**

Immediately after `device-env`, add:

```bash
export STEAM_USE_MANGOAPP=1
export STEAM_MANGOAPP_PRESETS_SUPPORTED=1
export STEAM_MANGOAPP_HORIZONTAL_SUPPORTED=1
export STEAM_DISABLE_MANGOAPP_ATOM_WORKAROUND=1

export MANGOHUD_CONFIGFILE=$(mktemp /tmp/mangohud.XXXXXXXX)
echo "no_display" >"$MANGOHUD_CONFIGFILE"
```

Extend the existing exit trap:

```bash
trap 'rm -f -- "$socket" "$MANGOHUD_CONFIGFILE"' EXIT
```

Immediately after exporting the nested display variables, add:

```bash
if command -v mangoapp >/dev/null; then
    (while true; do
        mangoapp
    done) &
fi
```

- [ ] **Step 4: Run focused verification and verify GREEN**

```bash
tests/test-nested-gaming-mangoapp.sh
bash -n system_files/usr/libexec/armada/nested-gaming
git diff --check
```

Expected: all commands exit 0 with no output.

- [ ] **Step 5: Commit the regression fix**

```bash
git add tests/test-nested-gaming-mangoapp.sh system_files/usr/libexec/armada/nested-gaming
git commit -m "fix: enable MangoApp in nested gaming"
```

### Task 2: Deploy and verify on the AYN Thor

**Files:**
- Deploy: `system_files/usr/libexec/armada/nested-gaming` to `/usr/libexec/armada/nested-gaming`
- Backup: device path `/tmp/nested-gaming.before-mangoapp`

**Interfaces:**
- Consumes: passwordless SSH and sudo; `armada-nested-gaming.service`; Steam app 1875580.
- Produces: a live session where Steam reports MangoApp enabled and Mina displays the selected overlay.

- [ ] **Step 1: Back up and deploy the launcher**

```bash
ssh -F /dev/null armada@192.168.86.35 'cp /usr/libexec/armada/nested-gaming /tmp/nested-gaming.before-mangoapp'
scp -F /dev/null system_files/usr/libexec/armada/nested-gaming armada@192.168.86.35:/tmp/nested-gaming.with-mangoapp
ssh -F /dev/null armada@192.168.86.35 'sudo install -o root -g root -m 0755 /tmp/nested-gaming.with-mangoapp /usr/libexec/armada/nested-gaming'
```

Expected: all commands exit 0.

- [ ] **Step 2: Restart only nested gaming and assert session startup**

```bash
ssh -F /dev/null armada@192.168.86.35 'systemctl --user restart armada-nested-gaming.service'
ssh -F /dev/null armada@192.168.86.35 'for i in $(seq 1 30); do pgrep -x mangoapp >/dev/null && pgrep -x steam >/dev/null && exit 0; sleep 1; done; exit 1'
```

Expected: MangoApp and Steam become live within 30 seconds.

- [ ] **Step 3: Assert Steam selected the MangoApp path**

```bash
ssh -F /dev/null armada@192.168.86.35 'grep -F "Using mangoapp: 1" "$HOME/.local/share/Steam/logs/systemperfmanager.txt" | tail -1'
```

Expected: a line from the new session containing `Using mangoapp: 1`.

- [ ] **Step 4: Launch Mina and assert MangoApp remains active**

```bash
ssh -F /dev/null armada@192.168.86.35 '
steam_pid=$(pgrep -x steam | head -1)
display=$(tr "\0" "\n" <"/proc/${steam_pid}/environ" | sed -n "s/^DISPLAY=//p")
gamescope_display=$(tr "\0" "\n" <"/proc/${steam_pid}/environ" | sed -n "s/^GAMESCOPE_WAYLAND_DISPLAY=//p")
DISPLAY="$display" GAMESCOPE_WAYLAND_DISPLAY="$gamescope_display" /usr/libexec/armada/launch-steam steam://rungameid/1875580
'
```

Then poll:

```bash
ssh -F /dev/null armada@192.168.86.35 '
for i in $(seq 1 60); do
  if pgrep -f "/Mina the Hollower/MinaTheHollower" >/dev/null; then
    pgrep -x mangoapp >/dev/null
    exit
  fi
  sleep 1
done
exit 1
'
```

Expected: Mina launches within 60 seconds, MangoApp stays alive, and the device visibly shows the persisted nonzero overlay.

- [ ] **Step 5: Run final verification**

```bash
tests/test-nested-gaming-mangoapp.sh
bash -n system_files/usr/libexec/armada/nested-gaming
git diff --check
git status --short
```

Expected: checks exit 0 and status preserves only unrelated untracked files.
