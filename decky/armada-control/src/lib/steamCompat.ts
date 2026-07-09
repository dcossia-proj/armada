// Compat driven through the live SteamClient API (Steam owns config.vdf): the
// global default Proton (the CompatToolMapping "0" wildcard) and the launch wrapper.

export interface CompatTool {
  id: string;
  label: string;
}

const apps = () => window.SteamClient?.Apps;
const settings = () => window.SteamClient?.Settings;

// Keep in sync with PROTON_TOOL_NAME (build) and PROTON_11_STABLE (armada-fixups).
export const DEFAULT_GLOBAL_COMPAT_TOOL = "proton-cachyos-11.0-arm64";

function mapCompatTools(raw: any): CompatTool[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((tool: any) => ({
      id: String(tool?.strToolName ?? tool?.strName ?? tool?.name ?? ""),
      label: String(tool?.strDisplayName ?? tool?.strToolName ?? tool?.strName ?? ""),
    }))
    .filter((tool: CompatTool) => tool.id);
}

// GetGlobalCompatTools is Proton-only (Steam filters server-side). Cached: changes only on tool install/remove.
let protonToolsCache: CompatTool[] | null = null;

export async function getProtonTools(refresh = false): Promise<CompatTool[]> {
  if (protonToolsCache && !refresh) return protonToolsCache;
  try {
    const list = mapCompatTools(await settings()?.GetGlobalCompatTools?.());
    if (list.length) protonToolsCache = list;
    return list;
  } catch (error) {
    return protonToolsCache ?? [];
  }
}

// A game's supported tools per Steam's OS filtering (Proton, plus SLR for a Linux depot); for the per-game picker.
export async function getAppCompatTools(appid: string): Promise<CompatTool[]> {
  try {
    return mapCompatTools(await apps()?.GetAvailableCompatTools?.(Number(appid)));
  } catch (error) {
    return [];
  }
}

// Steam reports "proton-stable" (not a real tool) when no "0" mapping is set: "Steam controlled".
export function isUnsetGlobal(tool: string): boolean {
  return tool === "" || tool === "proton-stable" || tool === "proton_stable";
}

// RegisterForSettingsChanges fires with current state on subscription; null on timeout/unavailable.
export function getGlobalCompatTool(): Promise<string | null> {
  return new Promise((resolve) => {
    const store = settings();
    if (!store?.RegisterForSettingsChanges) {
      resolve(null);
      return;
    }
    let done = false;
    let handle: any;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      try {
        handle?.unregister?.();
      } catch (error) {
      }
      resolve(value);
    };
    try {
      handle = store.RegisterForSettingsChanges((state: any) => finish(String(state?.strCompatTool ?? "")));
    } catch (error) {
      resolve(null);
      return;
    }
    window.setTimeout(() => finish(null), 3000);
  });
}

export async function setGlobalCompatTool(toolName: string): Promise<void> {
  try {
    await settings()?.SpecifyGlobalCompatTool?.(toolName);
  } catch (error) {
  }
}

// Enforces the armada default onto Steam's live mapping, reverting changes made in Steam's
// own panel. undefined -> cachy default; "" -> Steam Controlled (?? keeps "" distinct).
export async function reconcileGlobalCompat(stored: string | undefined): Promise<void> {
  let live: string | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    live = await getGlobalCompatTool();
    if (live !== null) break;
    await delay(2000);
  }
  if (live === null) return;
  const desired = stored ?? DEFAULT_GLOBAL_COMPAT_TOOL;
  if (desired === "") {
    if (!isUnsetGlobal(live)) await setGlobalCompatTool("");
  } else if (live !== desired) {
    await setGlobalCompatTool(desired);
  }
}

function appDetails(appid: string): any {
  try {
    return window.appDetailsStore?.GetAppDetails?.(Number(appid)) || null;
  } catch (error) {
    return null;
  }
}

export function currentCompatTool(appid: string): string {
  return String(appDetails(appid)?.strCompatToolName || "");
}

// Polls until Steam loads details, so the picker doesn't show "Use Default" over a real override.
export async function resolveCompatTool(appid: string): Promise<string> {
  return String((await resolveDetails(appid))?.strCompatToolName || "");
}

// "" clears the override, so the game follows the global default.
export async function specifyCompatTool(appid: string, toolName: string): Promise<void> {
  await apps()?.SpecifyCompatTool?.(Number(appid), toolName);
}

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function requestAppDetails(appid: string): void {
  // Not in @decky/ui's type defs (incomplete); exists on the runtime store.
  try {
    (window.appDetailsStore as any)?.RequestAppDetails?.(Number(appid));
  } catch (error) {
  }
}

// Absolute path: launch options run via a shell without /usr/libexec on PATH.
const LAUNCH_WRAPPER = "/usr/libexec/armada/armada-game-launch";
const COMMAND_TOKEN = "%command%";

// null when already wrapped (idempotent); preserves user options around %command%.
export function wrapLaunchOptions(current: string): string | null {
  const opts = current || "";
  if (opts.includes(LAUNCH_WRAPPER)) return null;
  if (opts.includes(COMMAND_TOKEN)) {
    return opts.replace(COMMAND_TOKEN, `${LAUNCH_WRAPPER} ${COMMAND_TOKEN}`);
  }
  // No %command%: Steam appends bare options as args, so keep them after it.
  const trimmed = opts.trim();
  return trimmed
    ? `${LAUNCH_WRAPPER} ${COMMAND_TOKEN} ${trimmed}`
    : `${LAUNCH_WRAPPER} ${COMMAND_TOKEN}`;
}

async function resolveDetails(appid: string, attempts = 5): Promise<any> {
  for (let i = 0; i < attempts; i++) {
    const details = appDetails(appid);
    if (details) return details;
    requestAppDetails(appid);
    await delay(1000);
  }
  return appDetails(appid);
}

// app_type: 1 = Game. Polls because overviews load a beat after plugin init.
async function resolveOverviewType(appid: string): Promise<number | null> {
  for (let i = 0; i < 5; i++) {
    try {
      const type = (window as any).appStore?.GetAppOverviewByAppID?.(Number(appid))?.app_type;
      if (type != null) return type;
    } catch (error) {
    }
    await delay(1000);
  }
  return null;
}

// Wraps only a confirmed game (app_type 1), never a tool/runtime. Returns false if the
// overview/details were still cold, so the caller can retry; true once resolved.
export async function applyLaunchWrapperToGame(appid: string): Promise<boolean> {
  const type = await resolveOverviewType(appid);
  if (type === null) return false;
  if (type !== 1) return true;
  const details = await resolveDetails(appid);
  if (!details) return false;
  const next = wrapLaunchOptions(String(details.strLaunchOptions || ""));
  if (next === null) return true;
  try {
    await apps()?.SetAppLaunchOptions?.(Number(appid), next);
  } catch (error) {
  }
  return true;
}

// Unknown app_type (overview not loaded yet) is treated as a game so a real game is never hidden.
export function isGameApp(appid: string): boolean {
  try {
    const type = (window as any).appStore?.GetAppOverviewByAppID?.(Number(appid))?.app_type;
    return type == null || type === 1;
  } catch (error) {
    return true;
  }
}

// Manifests include tools/runtimes, so type-check each; cold overviews are retried across rounds, not dropped.
export async function sweepInstalledGames(appids: string[]): Promise<void> {
  let pending = appids.filter(isGameApp);
  for (let round = 0; round < 6 && pending.length; round++) {
    if (round > 0) await delay(5000);
    const unresolved: string[] = [];
    let next = 0;
    const worker = async () => {
      while (next < pending.length) {
        const appid = pending[next++];
        if (!(await applyLaunchWrapperToGame(appid))) unresolved.push(appid);
      }
    };
    await Promise.all(Array.from({ length: Math.min(10, pending.length) }, worker));
    pending = unresolved;
  }
}

// Wrap launch options at download-start, so new installs get the wrapper too.
export function registerDownloadWatcher(): () => void {
  const downloads = window.SteamClient?.Downloads;
  if (!downloads?.RegisterForDownloadItems) return () => {};
  let timer: number | undefined;
  const pending = new Set<string>();
  const flush = () => {
    timer = undefined;
    for (const appid of pending) {
      applyLaunchWrapperToGame(appid);
    }
    pending.clear();
  };
  // Each queue item is { remote_client_id, item_data: [{ appid, ... }] } - the
  // appids live in the item_data entries, not on the item itself.
  const handle = downloads.RegisterForDownloadItems((_paused: boolean, items: any[]) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const entries = item?.item_data;
      if (!entries || typeof entries !== "object") continue;
      for (const entry of Object.values(entries) as any[]) {
        const appid = String(entry?.appid ?? "");
        if (appid && appid !== "0" && isGameApp(appid)) pending.add(appid);
      }
    }
    if (timer === undefined) timer = window.setTimeout(flush, 1500);
  });
  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
    try {
      handle?.unregister?.();
    } catch (error) {
    }
  };
}
