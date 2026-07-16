import asyncio
import time
from pathlib import Path

from .effects import effective_stick_configs, frame_for_stick
from .rgb import apply_frame

TICK_INTERVAL = 0.1  # 10Hz - smooth enough for breathing/rainbow/chase, gentle on the I2C bus

# Same flag fake-suspend touches/removes around a fake-sleep cycle (armada-
# powerd and the fan logic already coordinate through it). Checking it here
# rather than having fake-suspend poke the LEDs directly keeps every write
# flowing through apply_frame's _last_written cache - poking sysfs from
# outside would leave that cache stale and skip the real re-apply on resume.
FAKE_SUSPEND_FLAG = Path("/run/armada/fake-suspend.active")


class AnimationLoop:
    """Continuously applies whatever RGB config is current.

    Runs for the plugin's whole lifetime rather than only while a save is in
    flight, so effects (breathing/rainbow/chase) keep animating in the
    background. apply_frame() only writes zones whose value actually changed,
    so holding a static/off config here costs nothing after the first tick.
    """

    def __init__(self):
        self._config = None
        self._task = None

    def set_config(self, config):
        self._config = config

    def start(self):
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self):
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run(self):
        while True:
            config = self._config
            if config is not None:
                if FAKE_SUSPEND_FLAG.exists():
                    frame = {"left": (0, (0, 0, 0)), "right": (0, (0, 0, 0))}
                else:
                    left_cfg, right_cfg = effective_stick_configs(config)
                    now = time.monotonic()
                    frame = {
                        "left": frame_for_stick(left_cfg, now),
                        "right": frame_for_stick(right_cfg, now),
                    }
                await apply_frame(frame)
            await asyncio.sleep(TICK_INTERVAL)
