import { PanelSection, PanelSectionRow, Spinner } from "@decky/ui";
import { useEffect, useState } from "react";
import { getRgbState, saveRgbConfig } from "./backend";
import { StickPanel } from "./components/StickPanel";
import { ToggleRow } from "./components/widgets";
import { useDebouncedSave } from "./hooks/useDebouncedSave";
import type { RgbConfig } from "./types";

export function Content() {
  const [config, setConfig] = useState<RgbConfig | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRgbState()
      .then((state) => {
        if (cancelled) return;
        setConfig(state.config);
        setSupported(state.supported);
      })
      .catch(() => {
        if (!cancelled) setSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useDebouncedSave(config, (next) => {
    saveRgbConfig(next)
      .then((state) => setSupported(state.supported))
      .catch(() => {});
  });

  if (supported === null) {
    return (
      <PanelSection>
        <PanelSectionRow>
          <Spinner />
        </PanelSectionRow>
      </PanelSection>
    );
  }

  if (!config) {
    return (
      <PanelSection title="ThoRGB">
        <PanelSectionRow>No RGB configuration available.</PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <>
      {supported === false && (
        <PanelSection title="ThoRGB">
          <PanelSectionRow>
            No RGB-capable analog stick LEDs were found on this device. Settings below will be saved but won't do
            anything until compatible hardware is detected.
          </PanelSectionRow>
        </PanelSection>
      )}
      <PanelSection title="Analog Stick Lighting">
        <ToggleRow
          label="Sync Both Sticks"
          description="When on, the right stick mirrors the left stick's effect."
          value={config.sync}
          onChange={(sync) => setConfig({ ...config, sync })}
        />
      </PanelSection>
      <StickPanel
        title={config.sync ? "Both Sticks" : "Left Stick"}
        config={config.left}
        onChange={(left) => setConfig({ ...config, left })}
      />
      {!config.sync && (
        <StickPanel
          title="Right Stick"
          config={config.right}
          onChange={(right) => setConfig({ ...config, right })}
        />
      )}
    </>
  );
}
