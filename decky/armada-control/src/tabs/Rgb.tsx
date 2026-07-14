import { PanelSection, PanelSectionRow, SliderField, ToggleField } from "@decky/ui";
import type { Config, RgbZone } from "../types";

export function Rgb({ config, setConfig }: { config: Config; setConfig: (cb: (current: Config | null) => Config | null) => void }) {
  const rgb = config.rgb;

  const updateRgb = (updates: Partial<typeof rgb>) => {
    setConfig((current) => {
      if (!current) return current;
      return { ...current, rgb: { ...current.rgb, ...updates } };
    });
  };

  const updateZone = (zone: "left" | "right", updates: Partial<RgbZone>) => {
    setConfig((current) => {
      if (!current) return current;
      const nextRgb = {
        ...current.rgb,
        [zone]: { ...current.rgb[zone], ...updates },
      };
      
      // If sync is enabled and we're updating the left zone, mirror it to the right zone.
      if (current.rgb.sync && zone === "left") {
        nextRgb.right = { ...nextRgb.left };
      }
      return { ...current, rgb: nextRgb };
    });
  };

  const renderZoneControls = (zone: "left" | "right", title: string) => {
    const data = rgb[zone];
    return (
      <PanelSection title={title}>
        <PanelSectionRow>
          <SliderField
            label="Red"
            value={data.r}
            min={0}
            max={255}
            step={1}
            onChange={(val) => updateZone(zone, { r: val })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <SliderField
            label="Green"
            value={data.g}
            min={0}
            max={255}
            step={1}
            onChange={(val) => updateZone(zone, { g: val })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <SliderField
            label="Blue"
            value={data.b}
            min={0}
            max={255}
            step={1}
            onChange={(val) => updateZone(zone, { b: val })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <SliderField
            label="Brightness"
            value={data.brightness}
            min={0}
            max={255}
            step={1}
            onChange={(val) => updateZone(zone, { brightness: val })}
          />
        </PanelSectionRow>
      </PanelSection>
    );
  };

  return (
    <>
      <PanelSection title="RGB Settings">
        <PanelSectionRow>
          <ToggleField
            label="Enable RGB"
            checked={rgb.enabled}
            onChange={(val) => updateRgb({ enabled: val })}
          />
        </PanelSectionRow>
        {rgb.enabled && (
          <PanelSectionRow>
            <ToggleField
              label="Sync Left and Right"
              checked={rgb.sync}
              onChange={(val) => {
                if (val) {
                  // When enabling sync, immediately copy left to right
                  setConfig((current) => {
                    if (!current) return current;
                    return {
                      ...current,
                      rgb: {
                        ...current.rgb,
                        sync: true,
                        right: { ...current.rgb.left },
                      },
                    };
                  });
                } else {
                  updateRgb({ sync: false });
                }
              }}
            />
          </PanelSectionRow>
        )}
      </PanelSection>

      {rgb.enabled && (
        <>
          {renderZoneControls("left", rgb.sync ? "Color Controls" : "Left Zone")}
          {!rgb.sync && renderZoneControls("right", "Right Zone")}
        </>
      )}
    </>
  );
}
