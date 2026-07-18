#!/bin/bash
set -uxo pipefail
# Deliberately not -e: everything below must still reach the ownership fix
# at the bottom even if a step fails, or fish becomes unusable for the real
# user (root-owned config it can't write to - "permission denied creating
# temp files" on every prompt).

# Tide isn't packaged for Fedora or Terra - installed via the manual method
# from its own README (https://github.com/IlanCosman/tide#manual-installation)
# rather than bootstrapping Fisher (its usual plugin-manager install path)
# during an unattended image build. Runs as root, so HOME is pointed at the
# armada user's real home (created by 50-create-user.sh, which runs before
# this) and everything written gets handed back to them at the end.
export HOME=/var/home/armada
export XDG_CONFIG_HOME="${HOME}/.config"
mkdir -p "${XDG_CONFIG_HOME}/fish"

tide_tmp="$(mktemp -d)"
if curl --retry 3 -fsSL https://codeload.github.com/ilancosman/tide/tar.gz/v6 | tar -xzC "${tide_tmp}"; then
    cp -R "${tide_tmp}"/*/completions "${tide_tmp}"/*/conf.d "${tide_tmp}"/*/functions "${XDG_CONFIG_HOME}/fish/"
    # Runs tide's own first-install hook (writes sensible default prompt
    # settings as universal variables) instead of the interactive `tide
    # configure` wizard, which needs a real terminal. Best-effort: a
    # headless container build has no real display/session, so this
    # misbehaving must not be fatal.
    fish -c 'emit _tide_init_install' || echo "tide init hook failed (non-fatal)" >&2
else
    echo "failed to fetch tide (non-fatal, fish will just run without it)" >&2
fi
rm -rf "${tide_tmp}"

# Everything above ran as root with HOME pointed at armada's directory - fish
# and tide may have written under .local/share (history, etc.) as well as
# .config, regardless of whether the steps above fully succeeded. Chown the
# whole home directory, not just .config, and do it unconditionally.
chown -R armada:armada "${HOME}"
