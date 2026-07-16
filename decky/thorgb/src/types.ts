export type RgbMode = "off" | "static" | "breathing" | "rainbow" | "chase";

export interface StickConfig {
  mode: RgbMode;
  r: number;
  g: number;
  b: number;
  brightness: number;
  speed: number;
}

export interface RgbConfig {
  sync: boolean;
  left: StickConfig;
  right: StickConfig;
}

export interface RgbState {
  config: RgbConfig;
  supported: boolean;
  modes?: RgbMode[];
}
