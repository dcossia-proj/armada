import colorsys

MODES = ("off", "static", "breathing", "rainbow", "chase")
SEGMENT_COUNT = 4
DEFAULT_MODE = "static"


def _hsv_to_rgb255(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, s, v)
    return (round(r * 255), round(g * 255), round(b * 255))


def frame_for_stick(stick_config, now):
    """Pure function: (mode/color/brightness/speed, time) -> (brightness, [4 x (r,g,b)]).

    Takes advantage of the four independently addressable zones per stick -
    "rainbow" spaces a full hue sweep across the zones, "chase" lights one
    zone at a time in rotation. Both simply hold a solid frame at each tick,
    driven by the caller's animation loop.
    """
    mode = stick_config.get("mode", DEFAULT_MODE)
    if mode not in MODES:
        mode = DEFAULT_MODE
    color = (
        stick_config.get("r", 0),
        stick_config.get("g", 0),
        stick_config.get("b", 0),
    )
    brightness = stick_config.get("brightness", 0)
    speed = max(0.05, float(stick_config.get("speed", 1.0) or 1.0))

    if mode == "off":
        return 0, [(0, 0, 0)] * SEGMENT_COUNT

    if mode == "static":
        return brightness, [color] * SEGMENT_COUNT

    if mode == "breathing":
        # Triangle wave 0 -> 1 -> 0, ~3s period at speed=1.
        period = 3.0 / speed
        phase = (now % period) / period
        level = 1 - abs(phase * 2 - 1)
        return round(brightness * level), [color] * SEGMENT_COUNT

    if mode == "rainbow":
        # One full hue sweep across the 4 zones, slowly rotating over time.
        base_hue = (now * speed * 0.15) % 1.0
        segments = [_hsv_to_rgb255((base_hue + i / SEGMENT_COUNT) % 1.0, 1.0, 1.0) for i in range(SEGMENT_COUNT)]
        return brightness, segments

    if mode == "chase":
        # One zone lit at a time, stepping around the ring.
        step_duration = 0.5 / speed
        active = int(now / step_duration) % SEGMENT_COUNT
        segments = [color if i == active else (0, 0, 0) for i in range(SEGMENT_COUNT)]
        return brightness, segments

    return 0, [(0, 0, 0)] * SEGMENT_COUNT


def effective_stick_configs(config):
    """Applies the sync toggle: when synced, both sticks mirror "left"."""
    left = config.get("left", {})
    right = left if config.get("sync") else config.get("right", {})
    return left, right


def is_animated(config):
    left, right = effective_stick_configs(config)
    return left.get("mode") in ("breathing", "rainbow", "chase") or right.get("mode") in ("breathing", "rainbow", "chase")
