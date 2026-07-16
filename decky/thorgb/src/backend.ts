import { call } from "@decky/api";
import type { RgbConfig, RgbState } from "./types";

export const getRgbState = () => call<[], RgbState>("get_rgb_state");
export const saveRgbConfig = (config: RgbConfig) => call<[RgbConfig], RgbState>("save_rgb_config", config);
