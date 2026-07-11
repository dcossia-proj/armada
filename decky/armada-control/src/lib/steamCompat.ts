export interface CompatTool {
  id: string;
  label: string;
}

const apps = () => window.SteamClient?.Apps;
const settings = () => window.SteamClient?.Settings;

// Keep in sync with PROTON_TOOL_NAME (build) and PROTON_11_STABLE (armada-fixups).
export const DEFAULT_WINDOWS_COMPAT_TOOL = "proton-cachyos-11.0-arm64";
let windowsCompatTool = DEFAULT_WINDOWS_COMPAT_TOOL;

export function setWindowsCompatTool(toolName: string | undefined): void {
  windowsCompatTool = toolName || DEFAULT_WINDOWS_COMPAT_TOOL;
}

function mapCompatTools(raw: any): CompatTool[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((tool: any) => ({
      id: String(tool?.strToolName ?? tool?.strName ?? tool?.name ?? ""),
      label: String(tool?.strDisplayName ?? tool?.strToolName ?? tool?.strName ?? ""),
    }))
    .filter((tool: CompatTool) => tool.id);
}

// Steam can discover custom tools after frontend startup, so this result cannot be cached.
export async function getProtonTools(): Promise<CompatTool[]> {
  try {
    return mapCompatTools(await settings()?.GetGlobalCompatTools?.());
  } catch (error) {
    return [];
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

export async function resolveCompatTool(appid: string): Promise<string> {
  return String((await resolveDetails(appid))?.strCompatToolName || "");
}

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

async function applyWindowsCompatDefault(appid: string): Promise<boolean> {
  const type = await resolveOverviewType(appid);
  if (type === null) return false;
  if (type !== 1) return true;
  const details = await resolveDetails(appid);
  if (!details) return false;
  if (Number(details.nCompatToolPriority || 0) >= 250) return true;

  const protonTools = await getProtonTools();
  const protonIDs = new Set(protonTools.map((tool) => tool.id));
  if (!protonIDs.has(windowsCompatTool)) return false;
  const current = String(details.strCompatToolName || "");
  const platforms = Array.isArray(details.vecPlatforms) ? details.vecPlatforms.map(String) : [];
  const windowsOnly = platforms.includes("windows") && !platforms.includes("linux");
  if (current === "" && platforms.length === 0) return false;
  if (current === "" && !windowsOnly) return true;
  if (!protonIDs.has(current) && !(current === "" && windowsOnly)) return true;
  try {
    await specifyCompatTool(appid, windowsCompatTool);
  } catch (error) {
    return false;
  }
  return true;
}

async function applyGamePolicy(appid: string): Promise<boolean> {
  const wrapped = await applyLaunchWrapperToGame(appid);
  const compat = await applyWindowsCompatDefault(appid);
  return wrapped && compat;
}

async function applyGamePolicyWithRetries(appid: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await applyGamePolicy(appid)) return;
    await delay(5000);
  }
}

export async function migrateWindowsCompatTool(appids: string[], oldTool: string, newTool: string): Promise<void> {
  if (!oldTool || oldTool === newTool) return;
  const protonTools = await getProtonTools();
  if (!protonTools.some((tool) => tool.id === newTool)) return;
  setWindowsCompatTool(newTool);
  for (const appid of appids) {
    const type = await resolveOverviewType(appid);
    if (type !== 1) continue;
    const details = await resolveDetails(appid);
    if (!details) continue;
    if (Number(details.nCompatToolPriority || 0) < 250) continue;
    if (String(details.strCompatToolName || "") !== oldTool) continue;
    try {
      await specifyCompatTool(appid, newTool);
    } catch (error) {
    }
  }
}

export async function resetCompatToolToDefault(appid: string): Promise<string> {
  const details = await resolveDetails(appid);
  if (!details) return "";
  const protonTools = await getProtonTools();
  const protonIDs = new Set(protonTools.map((tool) => tool.id));
  const current = String(details.strCompatToolName || "");
  if (!protonIDs.has(current) || !protonIDs.has(windowsCompatTool)) return current;
  await specifyCompatTool(appid, windowsCompatTool);
  return windowsCompatTool;
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
        if (!(await applyGamePolicy(appid))) unresolved.push(appid);
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
      applyGamePolicyWithRetries(appid);
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
