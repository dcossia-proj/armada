import { PanelSection } from "@decky/ui";
import { ColorSwatch, SelectEdit, SliderEdit } from "./widgets";
import type { RgbMode, StickConfig } from "../types";

const MODE_OPTIONS: { data: RgbMode; label: string }[] = [
  { data: "off", label: "Off" },
  { data: "static", label: "Static Color" },
  { data: "breathing", label: "Breathing" },
  { data: "rainbow", label: "Rainbow (4 zones)" },
  { data: "chase", label: "Chase (4 zones)" },
];

export function StickPanel({ title, config, onChange }: {
  title: string;
  config: StickConfig;
  onChange: (next: StickConfig) => void;
}) {
  const set = <K extends keyof StickConfig>(key: K, value: StickConfig[K]) => onChange({ ...config, [key]: value });
  const showColor = config.mode !== "off";
  const showSpeed = config.mode === "breathing" || config.mode === "rainbow" || config.mode === "chase";

  return (
    <PanelSection title={title}>
      <SelectEdit label="Effect" value={config.mode} options={MODE_OPTIONS} onChange={(v) => set("mode", v)} />
      {showColor && (
        <>
          {config.mode === "static" || config.mode === "breathing" || config.mode === "chase" ? (
            <>
              <SliderEdit label="Red" value={config.r} min={0} max={255} step={1} onChange={(v) => set("r", v)} />
              <SliderEdit label="Green" value={config.g} min={0} max={255} step={1} onChange={(v) => set("g", v)} />
              <SliderEdit label="Blue" value={config.b} min={0} max={255} step={1} onChange={(v) => set("b", v)} />
              <ColorSwatch r={config.r} g={config.g} b={config.b} />
            </>
          ) : null}
          <SliderEdit label="Brightness" value={config.brightness} min={0} max={255} step={1} onChange={(v) => set("brightness", v)} />
        </>
      )}
      {showSpeed && (
        <SliderEdit label="Speed" value={config.speed} min={0.25} max={4} step={0.25} onChange={(v) => set("speed", v)} />
      )}
    </PanelSection>
  );
}
