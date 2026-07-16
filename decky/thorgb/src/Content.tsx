import { ButtonItem, PanelSection, PanelSectionRow, Spinner } from "@decky/ui";
import { useCallback, useEffect, useState } from "react";
import { getRgbState, saveRgbConfig } from "./backend";
import { StickPanel } from "./components/StickPanel";
import { ToggleRow } from "./components/widgets";
import { useDebouncedSave } from "./hooks/useDebouncedSave";
import type { LastApply, RgbConfig, RgbDiagnostics } from "./types";

function LastApplyDebug({ lastApply }: { lastApply: LastApply }) {
  const entries = Object.entries(lastApply.readback);
  if (!entries.length) return null;
  return (
    <PanelSection title="Last Applied (debug)">
      {entries.map(([led, entry]) => {
        const mismatch =
          String(entry.wrote.brightness) !== entry.read_back.brightness ||
          entry.wrote.multi_intensity !== entry.read_back.multi_intensity;
        return (
          <PanelSectionRow key={led}>
            <div style={{ fontSize: "12px", opacity: mismatch ? 1 : 0.6 }}>
              {led}: wrote brightness={entry.wrote.brightness} intensity="{entry.wrote.multi_intensity}" — read back
              brightness={entry.read_back.brightness ?? "?"} intensity="{entry.read_back.multi_intensity ?? "?"}"
              {mismatch ? " ⚠ MISMATCH (kernel didn't store what we wrote)" : " ✓ kernel matches"}
            </div>
          </PanelSectionRow>
        );
      })}
    </PanelSection>
  );
}

function Diagnostics({ diagnostics }: { diagnostics: RgbDiagnostics }) {
  return (
    <PanelSection title="Diagnostics">
      <PanelSectionRow>
        /sys/devices/platform multi-led* entries: {diagnostics.platform_multi_led_entries.length
          ? diagnostics.platform_multi_led_entries.join(", ")
          : "(none found)"}
      </PanelSectionRow>
      <PanelSectionRow>
        /sys/class/leds rgb:* entries: {diagnostics.class_rgb_entries.length
          ? diagnostics.class_rgb_entries.join(", ")
          : "(none found)"}
      </PanelSectionRow>
      {diagnostics.segments.map((entry) => (
        <PanelSectionRow key={`${entry.stick}-${entry.segment}-${entry.path}`}>
          <div style={{ fontSize: "12px", opacity: entry.has_multi_intensity ? 1 : 0.5 }}>
            {entry.stick}
            {entry.segment}: {entry.path} — dir {entry.dir_exists ? "✓" : "✗"}, multi_intensity{" "}
            {entry.has_multi_intensity ? "✓" : "✗"}, multi_index: {entry.multi_index ?? "(missing)"}
          </div>
        </PanelSectionRow>
      ))}
    </PanelSection>
  );
}

export function Content() {
  const [config, setConfig] = useState<RgbConfig | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [diagnostics, setDiagnostics] = useState<RgbDiagnostics | null>(null);
  const [lastApply, setLastApply] = useState<LastApply | null>(null);

  const refresh = useCallback(() => {
    return getRgbState()
      .then((state) => {
        setConfig(state.config);
        setSupported(state.supported);
        setDiagnostics(state.diagnostics ?? null);
        setLastApply(state.last_apply ?? null);
      })
      .catch(() => setSupported(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh().catch(() => {
      if (!cancelled) setSupported(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

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
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={refresh}>
              Re-scan Hardware
            </ButtonItem>
          </PanelSectionRow>
        </PanelSection>
      )}
      {supported === false && diagnostics && <Diagnostics diagnostics={diagnostics} />}
      <PanelSection title="Analog Stick Lighting">
        <ToggleRow
          label="Sync Both Sticks"
          description="When on, the right stick mirrors the left stick's color."
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
      {lastApply && <LastApplyDebug lastApply={lastApply} />}
    </>
  );
}
