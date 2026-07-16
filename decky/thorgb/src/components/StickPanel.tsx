import { PanelSection } from "@decky/ui";
import { ColorSwatch, SliderEdit } from "./widgets";
import type { StickConfig } from "../types";

export function StickPanel({ title, config, onChange }: {
  title: string;
  config: StickConfig;
  onChange: (next: StickConfig) => void;
}) {
  const set = <K extends keyof StickConfig>(key: K, value: StickConfig[K]) => onChange({ ...config, [key]: value });

  return (
    <PanelSection title={title}>
      <SliderEdit label="Red" value={config.r} min={0} max={255} step={1} onChange={(v) => set("r", v)} />
      <SliderEdit label="Green" value={config.g} min={0} max={255} step={1} onChange={(v) => set("g", v)} />
      <SliderEdit label="Blue" value={config.b} min={0} max={255} step={1} onChange={(v) => set("b", v)} />
      <ColorSwatch r={config.r} g={config.g} b={config.b} />
      <SliderEdit label="Brightness" value={config.brightness} min={0} max={255} step={1} onChange={(v) => set("brightness", v)} />
    </PanelSection>
  );
}
