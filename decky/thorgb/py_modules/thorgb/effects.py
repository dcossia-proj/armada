import colorsys

MODES = ("off", "static", "breathing", "rainbow", "chase")
DEFAULT_MODE = "static"


def _hsv_to_rgb255(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, s, v)
    return (round(r * 255), round(g * 255), round(b * 255))


def frame_for_stick(stick_config, now):
    """Pure function: (mode/color/brightness/speed, time) -> (brightness, (r, g, b)).

    Each stick is one zone - how many physical LED segments actually back it
    is a hardware/wiring detail apply_frame handles, not something effects
    reason about. Every mode here varies color/brightness over time only.
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
        return 0, (0, 0, 0)

    if mode == "static":
        return brightness, color

    if mode == "breathing":
        # Triangle wave 0 -> 1 -> 0, ~3s period at speed=1.
        period = 3.0 / speed
        phase = (now % period) / period
        level = 1 - abs(phase * 2 - 1)
        return round(brightness * level), color

    if mode == "rainbow":
        # Hue sweeps through the full ring over time, one color at a time.
        hue = (now * speed * 0.15) % 1.0
        return brightness, _hsv_to_rgb255(hue, 1.0, 1.0)

    if mode == "chase":
        # No segments to chase across - reads as a blink at the chosen color.
        step_duration = 0.5 / speed
        on = int(now / step_duration) % 2 == 0
        return (brightness if on else 0), color

    return 0, (0, 0, 0)


def effective_stick_configs(config):
    """Applies the sync toggle: when synced, both sticks mirror "left"."""
    left = config.get("left", {})
    right = left if config.get("sync") else config.get("right", {})
    return left, right


def is_animated(config):
    left, right = effective_stick_configs(config)
    return left.get("mode") in ("breathing", "rainbow", "chase") or right.get("mode") in ("breathing", "rainbow", "chase")
