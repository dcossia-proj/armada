import asyncio

from thorgb.animation import AnimationLoop
from thorgb.config import load_rgb_config, save_rgb_config
from thorgb.rgb import discover_leds, probe_hardware


class Plugin:
    def __init__(self):
        self._animation = AnimationLoop()

    async def _main(self):
        # Only schedules a background task and returns immediately - no
        # blocking LED I/O happens during plugin startup, so a wedged sysfs
        # write here can never stall Decky's readiness check.
        config = await asyncio.to_thread(load_rgb_config)
        self._animation.set_config(config)
        self._animation.start()

    async def _unload(self):
        await self._animation.stop()

    async def get_rgb_state(self):
        config = await asyncio.to_thread(load_rgb_config)
        # Force a fresh scan on every UI open/reload rather than trusting a
        # stale cache from _main()'s first attempt (e.g. right after boot,
        # before an I2C bus or module was ready).
        leds = await discover_leds(force=True)
        state = {
            "config": config,
            "supported": bool(leds),
            "last_apply": self._animation.last_result,
        }
        if not leds:
            state["diagnostics"] = await probe_hardware()
        return state

    async def probe_rgb_hardware(self):
        return await probe_hardware()

    async def save_rgb_config(self, config):
        saved = await asyncio.to_thread(save_rgb_config, config)
        self._animation.set_config(saved)
        self._animation.start()
        probe = await discover_leds()
        return {"config": saved, "supported": bool(probe)}
