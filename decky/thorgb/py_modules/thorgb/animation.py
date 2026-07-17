import asyncio

from .effects import effective_stick_configs, frame_for_stick
from .rgb import apply_frame

TICK_INTERVAL = 0.1  # 10Hz - gentle on the I2C bus while still picking up UI changes promptly


class AnimationLoop:
    """Continuously applies whatever RGB config is current.

    Runs for the plugin's whole lifetime rather than only while a save is in
    flight. apply_frame() only writes zones whose value actually changed, so
    holding the same static config here costs nothing after the first tick.

    Blanking the LEDs during a fake-suspend is fake-suspend's job, not this
    loop's - it pokes the LED brightness sysfs files directly and restores
    the exact value it saved, which is invisible to this loop's cache by
    construction (hardware ends up back where the cache already believed it
    was). Doing it here instead would make LED suspend behavior depend on
    this plugin being alive and scheduled, which is exactly what fake-suspend
    itself doesn't depend on for anything else it blanks (display, audio).
    """

    def __init__(self):
        self._config = None
        self._task = None
        self.last_result = None

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
                left_cfg, right_cfg = effective_stick_configs(config)
                frame = {
                    "left": frame_for_stick(left_cfg),
                    "right": frame_for_stick(right_cfg),
                }
                self.last_result = await apply_frame(frame)
            await asyncio.sleep(TICK_INTERVAL)
