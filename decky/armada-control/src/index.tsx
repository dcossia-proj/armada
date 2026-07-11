import { definePlugin } from "@decky/api";
import { getConfig, getInstalledGames } from "./backend";
import { Content } from "./Content";
import { registerDownloadWatcher, setWindowsCompatTool, sweepInstalledGames } from "./lib/steamCompat";

export default definePlugin(() => {
  const unregisterDownloadWatcher = registerDownloadWatcher();
  let cancelled = false;
  Promise.all([getConfig(), getInstalledGames()])
    .then(([config, games]) => {
      if (cancelled) return;
      setWindowsCompatTool(config.tweaks?.global?.windowsCompatTool);
      window.setTimeout(() => {
        if (!cancelled) sweepInstalledGames(games.map((game) => game.appid));
      }, 3000);
    })
    .catch(() => {});
  return {
    name: "Armada Control",
    content: <Content />,
    onDismount() {
      cancelled = true;
      unregisterDownloadWatcher();
    },
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 17H5" />
        <path d="M19 7h-9" />
        <circle cx="17" cy="17" r="3" />
        <circle cx="7" cy="7" r="3" />
      </svg>
    ),
    alwaysRender: true,
  };
});
