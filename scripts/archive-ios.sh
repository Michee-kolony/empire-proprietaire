#!/bin/bash
# Archive Release + contrôle du binaire final + export IPA. Aucun téléversement. À lancer sur le Mac.
set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE="com.empiresecurity.proprietaire"; TEAM="AQ5ZYSD79N"; VERSION="1.0"; BUILD="2"
PROFIL="Empire Security Propriétaire TestFlight 2026"
OUT="ios/App/output/build-$BUILD"; ARCHIVE="$OUT/App.xcarchive"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echec() { echo "ÉCHEC : $1" >&2; exit 1; }
egal() { [ "$2" = "$3" ] || echec "$1 = '$2' (attendu : '$3')"; echo "OK  $1 = $2"; }
cle() { plutil -extract "$2" raw -o - "$1" 2>/dev/null || true; }

[ "$(uname)" = "Darwin" ] || echec "ce script nécessite un Mac avec Xcode"
security find-identity -v -p codesigning > "$TMP/identites"
grep -q "Apple Distribution.*($TEAM)" "$TMP/identites" \
  || echec "aucun certificat Apple Distribution ($TEAM) avec clé privée dans le trousseau"

npm run ios:sync

rm -rf "$OUT"; mkdir -p "$OUT"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath "$TMP/dd" \
  -archivePath "$ARCHIVE" clean archive > "$OUT/archive.log" 2>&1 \
  || { grep -E "error:" "$OUT/archive.log" || tail -40 "$OUT/archive.log"; echec "archive (voir $OUT/archive.log)"; }

verifier() {
  local app="$1" p="$1/Info.plist" k
  [ -f "$p" ] || echec "$p introuvable"
  egal CFBundleIdentifier "$(cle "$p" CFBundleIdentifier)" "$BUNDLE"
  egal CFBundleShortVersionString "$(cle "$p" CFBundleShortVersionString)" "$VERSION"
  egal CFBundleVersion "$(cle "$p" CFBundleVersion)" "$BUILD"
  for k in NSPhotoLibraryUsageDescription NSPhotoLibraryAddUsageDescription NSCameraUsageDescription; do
    local v; v="$(cle "$p" "$k")"
    [ -n "${v//[[:space:]]/}" ] || echec "$k absente ou vide dans $p"
    echo "OK  $k = $v"
  done
  codesign --verify --deep --strict "$app" || echec "signature invalide"
  codesign -dvv "$app" > "$TMP/sign" 2>&1
  grep -q "^Authority=Apple Distribution" "$TMP/sign" || echec "signature autre que Apple Distribution"
  egal TeamIdentifier "$(sed -n 's/^TeamIdentifier=//p' "$TMP/sign")" "$TEAM"
  security cms -D -i "$app/embedded.mobileprovision" > "$TMP/profil.plist" 2>/dev/null
  egal Profil "$(cle "$TMP/profil.plist" Name)" "$PROFIL"
}

echo "== Contrôle de l'archive"
verifier "$ARCHIVE/Products/Applications/App.app"

xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$OUT/ipa" \
  -exportOptionsPlist ios/App/ExportOptions.plist > "$OUT/export.log" 2>&1 \
  || { tail -40 "$OUT/export.log"; echec "export (voir $OUT/export.log)"; }

echo "== Contrôle de l'IPA"
IPAS=("$OUT"/ipa/*.ipa)
[ -f "${IPAS[0]}" ] || echec "IPA introuvable"
unzip -q "${IPAS[0]}" -d "$TMP/ipa"
verifier "$TMP/ipa/Payload/App.app"

echo; echo "CONFORME, prêt à envoyer avec Transporter : ${IPAS[0]}"
open -R "${IPAS[0]}" || true
