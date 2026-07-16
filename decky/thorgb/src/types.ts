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

export interface LedProbeEntry {
  stick: "left" | "right";
  segment: number;
  path: string;
  dir_exists: boolean;
  has_multi_intensity: boolean;
  multi_index: string | null;
}

export interface RgbDiagnostics {
  segments: LedProbeEntry[];
  platform_multi_led_entries: string[];
  class_rgb_entries: string[];
}

export interface LedApplyEntry {
  wrote: { brightness: number; multi_intensity: string };
  read_back: { brightness: string | null; multi_intensity: string | null };
}

export interface LastApply {
  supported: boolean;
  applied: string[];
  readback: Record<string, LedApplyEntry>;
}

export interface RgbState {
  config: RgbConfig;
  supported: boolean;
  modes?: RgbMode[];
  diagnostics?: RgbDiagnostics;
  last_apply?: LastApply | null;
}
