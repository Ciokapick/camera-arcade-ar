#!/bin/sh
# Bibliotecile din npm (aceleași versiuni ca în index.html / ar.js / hands.js) + video-ul cu masa.
set -e
cd "$(dirname "$0")"
mkdir -p .libs .out
cd .libs
for spec in three@0.186.1:three-0.186.1 cannon-es@0.20.0:cannon-es-0.20.0 @8thwall/engine-binary@1.0.0:xr8 @mediapipe/tasks-vision@0.10.14:mp; do
  pkg=${spec%%:*}; dir=${spec##*:}
  [ -d "$dir" ] && continue
  tgz=$(npm pack "$pkg" 2>/dev/null | tail -1)
  mkdir -p "$dir" && tar xzf "$tgz" -C "$dir" && rm "$tgz"
done
cd ..
[ -f .out/table.y4m ] || python3 render.py
