import asyncio
from pathlib import Path

LEDS_ROOT = Path("/sys/class/leds")
STICKS = {"left": "l", "right": "r"}
SEGMENTS = (1, 2, 3, 4)
COLORS = ("red", "green", "blue")

# A stuck I2C transaction must never hang plugin readiness, a save call, or
# the animation loop - every sysfs read/write is bounded by this timeout and
# run off the event loop.
IO_TIMEOUT = 1.5

_FAILED = object()
_led_cache = None
_last_written = {}


def _led_name(stick, segment):
    return f"rgb:{STICKS[stick]}{segment}"


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
    if not LEDS_ROOT.is_dir():
        return discovered
    for stick in STICKS:
        for segment in SEGMENTS:
            led_dir = LEDS_ROOT / _led_name(stick, segment)
            if not (led_dir / "multi_intensity").exists():
                continue
            order = _channel_order(led_dir)
            if order is None:
                continue
            discovered[(stick, segment)] = order
    return discovered


def _intensity_string(order, rgb):
    # order is whatever multi_index reported - never assume RGB/BGR/etc.
    values = dict(zip(COLORS, rgb))
    return " ".join(str(values[color]) for color in order)


def _apply_segment_sync(stick, segment, order, brightness, rgb):
    led_dir = LEDS_ROOT / _led_name(stick, segment)
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
    for (stick, segment), order in leds.items():
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

        result = await _guarded(_apply_segment_sync, stick, segment, order, brightness_value, rgb)
        if result is not _FAILED:
            _last_written[cache_key] = desired
            applied.append(f"{stick}{segment}")
    return {"supported": True, "applied": applied}
