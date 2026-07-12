# Nested Gaming MangoApp Design

## Problem

The dual-screen nested gaming session starts Gamescope and Steam directly
instead of using `gamescope-session-plus`. That preserves the second screen,
but it bypasses the reference session's MangoApp initialization. Steam therefore
reports `Using mangoapp: 0`, falls back to per-game `mangohud` injection, and its
performance overlay is not displayed.

Live diagnosis on the AYN Thor confirmed that MangoHud 0.8.4 and MangoApp run on
the aarch64 Adreno stack. A foreground MangoApp probe remained healthy inside
the active nested Gamescope session. The missing session integration, rather
than a Vulkan or architecture incompatibility, is the root cause.

## Considered Approaches

### 1. Integrate MangoApp into `nested-gaming` (selected)

Mirror the relevant `gamescope-session-plus` behavior in Armada's nested
launcher: advertise MangoApp support to Steam, create the initial hidden
MangoHud configuration, and supervise MangoApp for the life of the gaming
session. This restores SteamOS behavior at the session boundary where it was
lost and applies to every game.

### 2. Install a user-level override on the current device

A separate user service could start MangoApp and inject variables into Steam.
This would be device-specific, vulnerable to image updates, and would split one
session lifecycle across multiple units.

### 3. Force `mangohud` into every game launch

Steam already attempts this fallback. It does not provide the Gamescope
external-overlay behavior expected by the Steam performance menu and is less
compatible with mixed native and containerized ARM games.

## Design

`system_files/usr/libexec/armada/nested-gaming` will initialize the MangoApp
contract before starting Steam:

- Set `STEAM_USE_MANGOAPP=1` so Steam uses the external MangoApp path.
- Set `STEAM_MANGOAPP_PRESETS_SUPPORTED=1` and
  `STEAM_MANGOAPP_HORIZONTAL_SUPPORTED=1` so Steam exposes the supported
  preset and horizontal layouts.
- Set `STEAM_DISABLE_MANGOAPP_ATOM_WORKAROUND=1`, matching the packaged Steam
  session because current MangoApp manages its Gamescope overlay property.
- Create a session-private configuration file under `/tmp`, export it as
  `MANGOHUD_CONFIGFILE`, and initialize it with `no_display` so MangoApp does
  not appear before Steam applies the selected performance-overlay level.

After Gamescope completes its readiness handshake and the nested display
variables are exported, the launcher will start MangoApp in a restart loop.
MangoApp therefore receives the same `DISPLAY` and
`GAMESCOPE_WAYLAND_DISPLAY` as Steam. If MangoApp exits unexpectedly, it is
restarted without taking down Steam or Gamescope.

The launcher's exit trap will remove the readiness FIFO and MangoHud
configuration file. Background processes remain in the systemd service's
cgroup and are terminated with the unit, matching the existing Gamescope and
refresh-bridge lifecycle.

## Testing

A shell regression test will inspect the launcher contract without requiring a
real compositor. It will fail on the current branch because the capability
variables, hidden initial configuration, and MangoApp supervision are absent.
After implementation it will verify those behaviors and run Bash syntax
validation.

Live verification on the Thor will then:

1. Deploy the launcher to `/usr/libexec/armada/nested-gaming` with a backup.
2. Restart only `armada-nested-gaming.service`.
3. Confirm Steam logs `Using mangoapp: 1`, the MangoApp process remains alive,
   and the Gamescope external-overlay window exists.
4. Launch Mina the Hollower (Steam app 1875580), select a nonzero performance
   overlay level, and confirm the overlay remains active for the game.

## Scope

This change fixes only MangoApp integration in the nested dual-screen gaming
session. It does not alter the embedded Gamescope session, MangoHud packaging,
Steam's game launch commands, or refresh-rate bridging.
