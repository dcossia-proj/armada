def frame_for_stick(stick_config):
    """(color/brightness config) -> (brightness, (r, g, b)). Static only -
    the effect-mode animation (off/breathing/rainbow/chase) never reliably
    took effect on real hardware and wasn't worth chasing further; this is
    deliberately just a color and a brightness."""
    color = (
        stick_config.get("r", 0),
        stick_config.get("g", 0),
        stick_config.get("b", 0),
    )
    brightness = stick_config.get("brightness", 0)
    return brightness, color


def effective_stick_configs(config):
    """Applies the sync toggle: when synced, both sticks mirror "left"."""
    left = config.get("left", {})
    right = left if config.get("sync") else config.get("right", {})
    return left, right
