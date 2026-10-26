#!/usr/bin/env bash
# Memperbarui repo F-Droid Phoenix Chat dan memublikasikannya ke GitHub Pages.
#
#   scripts/publish-fdroid.sh [path/ke/fdroid]
#   SITE_ONLY=1 scripts/publish-fdroid.sh     # hanya halaman web, repo F-Droid tidak diubah
#
# Prasyarat: fdroidserver terpasang (pip install fdroidserver), Android SDK di
# ANDROID_HOME, APK rilis sudah dibangun (cd android && ./gradlew assembleRelease),
# dan fdroid/config.yml + fdroid/keystore.p12 ada (dibuat sekali dengan `fdroid init`,
# tidak ikut git — simpan cadangannya).
#
# APK universal tidak ikut: ukurannya melebihi batas 100 MB per file di GitHub.
set -euo pipefail

FDROID=${1:-fdroid}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REPO_DIR="$ROOT/fdroid"
APK_DIR="$ROOT/android/app/build/outputs/apk/release"
export ANDROID_HOME=${ANDROID_HOME:-$HOME/Android/Sdk}

[ -f "$REPO_DIR/config.yml" ] || { echo "fdroid/config.yml tidak ada; jalankan 'fdroid init' di folder fdroid/ dulu." >&2; exit 1; }

VERSION=$(sed -n 's/.*versionName = "\(.*\)"/\1/p' "$ROOT/android/app/build.gradle.kts")

# SITE_ONLY=1: hanya perbarui halaman web (mis. kebijakan privasi); APK dan indeks repo yang
# sudah terbit tidak diubah. Jangan pernah menerbitkan APK berbeda dengan versionCode yang sama.
if [ "${SITE_ONLY:-0}" != 1 ]; then
mkdir -p "$REPO_DIR/repo"
for abi in arm64-v8a armeabi-v7a x86_64; do
  cp "$APK_DIR/app-$abi-release.apk" "$REPO_DIR/repo/PhoenixChat-$VERSION-$abi.apk"
done
# fdroidserver membaca repo_icon relatif terhadap folder fdroid/, lalu menyalinnya ke repo/icons/.
cp "$ROOT/electron/icon.png" "$REPO_DIR/icon.png"

cd "$REPO_DIR"
"$FDROID" update --create-metadata --pretty
"$FDROID" update --pretty
fi

# gh-pages hanya berisi salinan terbaru (tanpa riwayat) agar repo tidak membengkak.
PAGES=$(mktemp -d)
trap 'rm -rf "$PAGES"' EXIT
mkdir -p "$PAGES/fdroid"
cp -r "$REPO_DIR/repo" "$PAGES/fdroid/repo"
[ -d "$REPO_DIR/archive" ] && cp -r "$REPO_DIR/archive" "$PAGES/fdroid/archive"
touch "$PAGES/.nojekyll"
# Halaman statis lain (kebijakan privasi untuk Play Store, dll.) dari folder site/.
cp -r "$ROOT/site/." "$PAGES/"
cat > "$PAGES/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=fdroid/repo/">
<title>Phoenix Chat</title><a href="fdroid/repo/">Phoenix Chat F-Droid repo</a> · <a href="privacy/">Privacy policy</a>
HTML

cd "$PAGES"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$ROOT" config user.name || echo Phoenix Chat)" \
    -c user.email="$(git -C "$ROOT" config user.email || echo noreply@localhost)" \
    commit -q -m "Repo F-Droid Phoenix Chat $VERSION"
git push -q -f "$(git -C "$ROOT" remote get-url origin)" gh-pages
echo "Terbit: https://delfiboyz.github.io/PhoenixChat/fdroid/repo"
