import json
import os
import tempfile
from pathlib import Path

CONFIG_PATH = Path("/var/lib/thorgb/rgb-config.json")

DEFAULT_STICK = {"r": 0, "g": 120, "b": 255, "brightness": 128}
DEFAULT_CONFIG = {"sync": True, "left": dict(DEFAULT_STICK), "right": dict(DEFAULT_STICK)}


def _blank_config():
    return {"sync": True, "left": dict(DEFAULT_STICK), "right": dict(DEFAULT_STICK)}


def _normalize_stick(value, base):
    stick = dict(base)
    if not isinstance(value, dict):
        return stick
    for key in ("r", "g", "b", "brightness"):
        if key in value:
            try:
                stick[key] = max(0, min(255, int(value[key])))
            except (TypeError, ValueError):
                pass
    return stick


def load_rgb_config():
    config = _blank_config()
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return config
    if not isinstance(data, dict):
        return config
    config["sync"] = bool(data.get("sync", True))
    config["left"] = _normalize_stick(data.get("left"), DEFAULT_STICK)
    config["right"] = _normalize_stick(data.get("right"), DEFAULT_STICK)
    return config


def save_rgb_config(config):
    if not isinstance(config, dict):
        raise ValueError("invalid rgb config")
    normalized = {
        "sync": bool(config.get("sync", True)),
        "left": _normalize_stick(config.get("left"), DEFAULT_STICK),
        "right": _normalize_stick(config.get("right"), DEFAULT_STICK),
    }

    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{CONFIG_PATH.name}.", dir=CONFIG_PATH.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(normalized, f)
        os.replace(tmp, CONFIG_PATH)
    finally:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
    return normalized
