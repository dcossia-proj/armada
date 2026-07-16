import { PanelSectionRow, SliderField, ToggleField } from "@decky/ui";
import type { ReactNode } from "react";

export function ToggleRow({ label, value, onChange, description }: {
  label: ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: ReactNode;
}) {
  return (
    <PanelSectionRow>
      <ToggleField label={label} description={description} checked={value} onChange={onChange} />
    </PanelSectionRow>
  );
}

export function SliderEdit({ label, value, min, max, step, onChange }: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <PanelSectionRow>
      <SliderField label={label} value={value} min={min} max={max} step={step} showValue onChange={onChange} />
    </PanelSectionRow>
  );
}

export function ColorSwatch({ r, g, b }: { r: number; g: number; b: number }) {
  return (
    <PanelSectionRow>
      <div
        style={{
          height: "24px",
          borderRadius: "4px",
          border: "1px solid rgba(255,255,255,0.24)",
          background: `rgb(${r}, ${g}, ${b})`,
        }}
      />
    </PanelSectionRow>
  );
}
