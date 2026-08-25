#!/usr/bin/env bash
# Remove a local/test G-AID install (user launcher + config).
# Does not delete project source or dist_desktop packages you may send to testers.
set -euo pipefail

rm -f "${HOME}/.local/share/applications/g-aid.desktop"
rm -f "${HOME}/.local/share/applications/G-AID.desktop"
rm -f "${HOME}/.local/share/icons/hicolor/512x512/apps/g-aid.png"
rm -rf "${HOME}/.config/G-AID"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${HOME}/.local/share/applications" >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f "${HOME}/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

if command -v dpkg >/dev/null 2>&1 && dpkg -s g-aid >/dev/null 2>&1; then
  echo "System package g-aid is installed. Remove it with:"
  echo "  sudo apt remove --purge g-aid"
fi

echo "Removed G-AID user launcher and app data from ${HOME}."
echo "Kept any files in dist_desktop/ for sharing."
