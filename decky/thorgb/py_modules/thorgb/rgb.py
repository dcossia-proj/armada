import asyncio
from pathlib import Path

CLASS_ROOT = Path("/sys/class/leds")
PLATFORM_ROOT = Path("/sys/devices/platform")
STICKS = {"left": "l", "right": "r"}
SEGMENTS = (1, 2, 3, 4)
COLORS = ("red", "green", "blue")

# A stuck I2C transaction must never hang plugin readiness, a save call, or
# the animation loop - every sysfs read/write is bounded by this timeout and
# run off the event loop.
IO_TIMEOUT = 1.5

_FAILED = object()
_led_cache = None  # {(stick, segment): (Path, [color, color, color])}
_last_written = {}


def _led_short_name(stick, segment):
    return f"rgb:{STICKS[stick]}{segment}"


def _candidate_dirs(stick, segment):
    """Every sysfs location this LED group might actually live at.

    ROCKNIX's own Thor scripts (validated on real hardware) address these
    groups at /sys/devices/platform/multi-led<side><n>/leds/rgb:<side><n>/ -
    that's tried first. The standard /sys/class/leds/ class path is kept as
    a fallback in case it also resolves (every led classdev is normally
    registered under the class tree too, but we don't assume it).
    """
    short = _led_short_name(stick, segment)
    platform_name = f"multi-led{STICKS[stick]}{segment}"
    return [
        PLATFORM_ROOT / platform_name / "leds" / short,
        CLASS_ROOT / short,
    ]


def _read_text(path):
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return None


def _channel_order(led_dir):
    # multi_index gives the real per-device channel order for multi_intensity -
    # never assume RGB (or any other) ordering, read it back from the kernel.
    raw = _read_text(led_dir / "multi_index")
    if not raw:
        return None
    order = raw.split()
    if sorted(order) != sorted(COLORS):
        return None
    return order


def _discover_sync():
    discovered = {}
    for stick in STICKS:
        for segment in SEGMENTS:
            for led_dir in _candidate_dirs(stick, segment):
                if not (led_dir / "multi_intensity").exists():
                    continue
                order = _channel_order(led_dir)
                if order is None:
                    continue
                discovered[(stick, segment)] = (led_dir, order)
                break
    return discovered


def _probe_sync():
    """Diagnostic snapshot of everything discovery looked at and found -
    so a detection failure can be root-caused from the running plugin
    without another blind guess-fix-reflash cycle."""
    report = {"segments": [], "platform_multi_led_entries": [], "class_rgb_entries": []}

    if PLATFORM_ROOT.is_dir():
        report["platform_multi_led_entries"] = sorted(
            p.name for p in PLATFORM_ROOT.iterdir() if p.name.startswith("multi-led")
        )
    if CLASS_ROOT.is_dir():
        report["class_rgb_entries"] = sorted(p.name for p in CLASS_ROOT.iterdir() if p.name.startswith("rgb:"))

    for stick in STICKS:
        for segment in SEGMENTS:
            for led_dir in _candidate_dirs(stick, segment):
                entry = {
                    "stick": stick,
                    "segment": segment,
                    "path": str(led_dir),
                    "dir_exists": led_dir.is_dir(),
                    "has_multi_intensity": (led_dir / "multi_intensity").exists(),
                    "multi_index": _read_text(led_dir / "multi_index"),
                }
                report["segments"].append(entry)
    return report


def _intensity_string(order, rgb):
    # order is whatever multi_index reported - never assume RGB/BGR/etc.
    values = dict(zip(COLORS, rgb))
    return " ".join(str(values[color]) for color in order)


def _apply_segment_sync(led_dir, order, brightness, rgb):
    (led_dir / "brightness").write_text(str(brightness), encoding="utf-8")
    (led_dir / "multi_intensity").write_text(_intensity_string(order, rgb), encoding="utf-8")


async def _guarded(func, *args):
    """Run func off-loop with a hard timeout; returns _FAILED instead of raising/hanging."""
    try:
        return await asyncio.wait_for(asyncio.to_thread(func, *args), timeout=IO_TIMEOUT)
    except Exception:
        return _FAILED


async def discover_leds(force=False):
    global _led_cache
    if force or _led_cache is None:
        result = await _guarded(_discover_sync)
        _led_cache = {} if result is _FAILED else result
        _last_written.clear()
    return _led_cache


async def probe_hardware():
    result = await _guarded(_probe_sync)
    return {} if result is _FAILED else result


def _clamp(value, low=0, high=255):
    try:
        value = int(value)
    except (TypeError, ValueError):
        return low
    return max(low, min(high, value))


async def apply_frame(frame, force=False):
    """frame: {"left": (brightness, [(r,g,b) x4]), "right": (brightness, [(r,g,b) x4])}.

    Segment lists are indexed 0..3 for zones 1..4. Only writes to zones that
    actually changed since the last applied frame, unless force=True - this
    keeps the animation loop from hammering the I2C bus every tick when
    nothing actually changed (e.g. "off"/"static" after the first frame).
    """
    leds = await discover_leds()
    if not leds:
        return {"supported": False, "applied": []}

    applied = []
    for (stick, segment), (led_dir, order) in leds.items():
        entry = frame.get(stick)
        if not entry:
            continue
        brightness, segment_colors = entry
        idx = segment - 1
        if idx >= len(segment_colors):
            continue
        rgb = tuple(_clamp(c) for c in segment_colors[idx])
        brightness_value = _clamp(brightness)

        cache_key = (stick, segment)
        desired = (brightness_value, rgb)
        if not force and _last_written.get(cache_key) == desired:
            continue

        result = await _guarded(_apply_segment_sync, led_dir, order, brightness_value, rgb)
        if result is not _FAILED:
            _last_written[cache_key] = desired
            applied.append(f"{stick}{segment}")
    return {"supported": True, "applied": applied}
