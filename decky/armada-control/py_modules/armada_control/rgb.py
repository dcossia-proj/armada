import json
from pathlib import Path
from .system import atomically_write

RGB_CONFIG = Path("/etc/armada/rgb.json")

def default_rgb_config():
    return {
        "enabled": True,
        "sync": True,
        "left": {"r": 255, "g": 255, "b": 255, "brightness": 255},
        "right": {"r": 255, "g": 255, "b": 255, "brightness": 255},
    }

def get_rgb_config():
    try:
        if not RGB_CONFIG.exists():
            return default_rgb_config()
        config = json.loads(RGB_CONFIG.read_text(encoding="utf-8"))
        merged = default_rgb_config()
        merged.update(config)
        return merged
    except (OSError, json.JSONDecodeError):
        return default_rgb_config()

def save_rgb_config(data):
    merged = default_rgb_config()
    merged.update(data)
    atomically_write(RGB_CONFIG, json.dumps(merged, indent=2))
    apply_rgb_config(merged)
    return merged

def discover_leds():
    leds_dir = Path("/sys/class/leds")
    if not leds_dir.exists():
        return {}

    # Check for multicolor nodes first (Odin 2 format)
    left_multi = leds_dir / "multicolor:left"
    right_multi = leds_dir / "multicolor:right"
    if left_multi.exists() or right_multi.exists():
        return {
            "type": "multicolor",
            "left": left_multi,
            "right": right_multi
        }

    # Otherwise, parse individual single-color channels (Odin 3 format)
    channels = {
        "type": "individual",
        "left": {"r": [], "g": [], "b": []},
        "right": {"r": [], "g": [], "b": []}
    }

    for path in leds_dir.iterdir():
        name = path.name.lower()
        # Skip unrelated system leds
        if name.startswith(("mmc", "backlight", "input", "default")):
            continue
        
        # Determine side (matches 'l:r1', 'left_red', etc.)
        side = None
        if name.startswith("l:") or "left" in name or name.startswith("l_"):
            side = "left"
        elif name.startswith("r:") or "right" in name or name.startswith("r_"):
            side = "right"
            
        if not side:
            continue
            
        # Determine color channel
        color = None
        if ":r" in name or "_r" in name or "red" in name:
            color = "r"
        elif ":g" in name or "_g" in name or "green" in name:
            color = "g"
        elif ":b" in name or "_b" in name or "blue" in name:
            color = "b"
            
        if color:
            channels[side][color].append(path / "brightness")

    return channels

def _apply_multicolor_zone(zone_name, zone_data, enabled):
    sys_path = Path(f"/sys/class/leds/multicolor:{zone_name}")
    if not sys_path.exists():
        return
    
    brightness_path = sys_path / "brightness"
    intensity_path = sys_path / "multi_intensity"
    
    if not enabled:
        if brightness_path.exists():
            try:
                brightness_path.write_text("0\n")
            except OSError:
                pass
        return
    
    if intensity_path.exists():
        try:
            r = int(zone_data.get("r", 255))
            g = int(zone_data.get("g", 255))
            b = int(zone_data.get("b", 255))
            intensity_path.write_text(f"{r} {g} {b}\n")
        except (OSError, ValueError):
            pass
            
    if brightness_path.exists():
        try:
            br = int(zone_data.get("brightness", 255))
            brightness_path.write_text(f"{br}\n")
        except (OSError, ValueError):
            pass

def _apply_individual_zone(color_paths, r, g, b, brightness, enabled):
    for color, paths in color_paths.items():
        for path in paths:
            if not path.exists():
                continue
            try:
                if not enabled:
                    path.write_text("0\n")
                else:
                    # Calculate scaled brightness value per channel
                    val = r if color == "r" else (g if color == "g" else b)
                    actual_val = int((val * brightness) / 255.0)
                    path.write_text(f"{actual_val}\n")
            except (OSError, ValueError):
                pass

def apply_rgb_config(config):
    enabled = config.get("enabled", True)
    sync = config.get("sync", True)
    left_data = config.get("left", {})
    right_data = config.get("right", {})
    
    leds = discover_leds()
    if not leds:
        return
        
    if leds["type"] == "multicolor":
        _apply_multicolor_zone("left", left_data, enabled)
        if sync:
            _apply_multicolor_zone("right", left_data, enabled)
        else:
            _apply_multicolor_zone("right", right_data, enabled)
    elif leds["type"] == "individual":
        left_r = int(left_data.get("r", 255))
        left_g = int(left_data.get("g", 255))
        left_b = int(left_data.get("b", 255))
        left_brightness = int(left_data.get("brightness", 255))
        
        _apply_individual_zone(leds["left"], left_r, left_g, left_b, left_brightness, enabled)
        
        if sync:
            _apply_individual_zone(leds["right"], left_r, left_g, left_b, left_brightness, enabled)
        else:
            right_r = int(right_data.get("r", 255))
            right_g = int(right_data.get("g", 255))
            right_b = int(right_data.get("b", 255))
            right_brightness = int(right_data.get("brightness", 255))
            _apply_individual_zone(leds["right"], right_r, right_g, right_b, right_brightness, enabled)
