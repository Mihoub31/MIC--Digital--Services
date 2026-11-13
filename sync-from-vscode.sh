#!/data/data/com.termux/files/usr/bin/bash
set -e

SOURCE="$HOME/storage/shared/MIC-Digital-Services"
TARGET="$HOME/MIC-Digital-Services"

mkdir -p "$TARGET/backup"
cp "$TARGET/index.html" "$TARGET/backup/index-before-sync.html"
cp "$TARGET/server/server.js" "$TARGET/backup/server-before-sync.js"

cp -r "$SOURCE/." "$TARGET/"

echo "Sync completed successfully."
echo "Original .env and node_modules were preserved."
