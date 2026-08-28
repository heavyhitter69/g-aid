#!/bin/bash
set -e

# electron-builder installs the app under /opt/<productName>
for dir in "/opt/G-AID" "/opt/g-aid"; do
  if [ -e "$dir/chrome-sandbox" ]; then
    chown root:root "$dir/chrome-sandbox" || true
    chmod 4755 "$dir/chrome-sandbox" || true
  fi
done

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi

if command -v update-mime-database >/dev/null 2>&1; then
  update-mime-database /usr/share/mime >/dev/null 2>&1 || true
fi

if command -v xdg-mime >/dev/null 2>&1; then
  xdg-mime default g-aid.desktop x-scheme-handler/gaid || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi
