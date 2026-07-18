#!/bin/bash
set -euxo pipefail

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
trap 'rm -rf "${tide_tmp}"' EXIT
curl --retry 3 -fsSL https://codeload.github.com/ilancosman/tide/tar.gz/v6 | tar -xzC "${tide_tmp}"
cp -R "${tide_tmp}"/*/completions "${tide_tmp}"/*/conf.d "${tide_tmp}"/*/functions "${XDG_CONFIG_HOME}/fish/"

# Runs tide's own first-install hook (writes sensible default prompt
# settings as universal variables) instead of the interactive `tide
# configure` wizard, which needs a real terminal.
fish -c 'emit _tide_init_install'

chown -R armada:armada "${HOME}/.config"
