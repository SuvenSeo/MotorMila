#!/bin/bash
# TEMPORARY (branch android/apple-polish; delete before merge).
# Baseline Profile generation + macrobenchmarks on the CI emulator against the
# non-debuggable preview APK. Usage: perf.sh <app.apk> <baselineprofile.apk> <outdir>
set -u
APP="$1"; TEST="$2"; OUT="$3"
mkdir -p "$OUT"
PKG=lk.motormila.app.debug
TPKG=lk.motormila.baselineprofile
adb root >/dev/null 2>&1 || true
sleep 3
adb wait-for-device
adb install -r -t "$APP" | tail -1
adb install -r -t "$TEST" | tail -1
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb shell settings put global hide_error_dialogs 1
# First launch once so the app is warm on disk / splash checks are done.
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep 12
adb shell am force-stop $PKG
DEV_OUT=/sdcard/Download/mm-perf
adb shell rm -rf $DEV_OUT; adb shell mkdir -p $DEV_OUT
COMMON="-e androidx.benchmark.suppressErrors EMULATOR,LOW-BATTERY,UNLOCKED,DEBUGGABLE,ACTIVITY-MISSING -e additionalTestOutputDir $DEV_OUT -e targetAppId $PKG -e no-isolated-storage true"
run() {
  local cls="$1"; local tag="$2"
  echo "=== $tag ($cls)"
  timeout 1500 adb shell am instrument -w -r $COMMON -e class "$cls" $TPKG/androidx.test.runner.AndroidJUnitRunner > "$OUT/$tag.log" 2>&1
  echo "exit=$?"; grep -E "INSTRUMENTATION_STATUS: (test|stack)=|OK \(|FAILURES|Tests run|frameDurationCpuMs|frameOverrunMs|timeToInitialDisplayMs|Error|Exception" "$OUT/$tag.log" | head -60
}
run lk.motormila.baselineprofile.BaselineProfileGenerator generator
# Pull the generated profile now: the next instrumentation run clears the output dir.
mkdir -p "$OUT/profile"
for f in $(adb shell ls $DEV_OUT 2>/dev/null | tr -d '\r' | grep -E "prof.*\.txt$"); do adb pull "$DEV_OUT/$f" "$OUT/profile/" >/dev/null; done
ls -la "$OUT/profile"
run lk.motormila.baselineprofile.Benchmarks bench
adb pull $DEV_OUT "$OUT/device" >/dev/null 2>&1 || true
adb pull /sdcard/Android/media/$TPKG "$OUT/media" >/dev/null 2>&1 || true
find "$OUT" -type f | head -50
for f in $(find "$OUT" -name "*prof*.txt"); do echo "$f: $(wc -l < "$f") rules"; done
for f in $(find "$OUT" -name "*benchmarkData.json"); do
  python3 - "$f" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
for b in d.get("benchmarks",[]):
    print(b.get("name"))
    for k,v in (b.get("metrics") or {}).items():
        print("  ",k,{x:round(v.get(x,0),1) for x in ("minimum","median","maximum")})
    for k,v in (b.get("sampledMetrics") or {}).items():
        print("  ",k,{x:round(v.get(x,0),1) for x in ("P50","P90","P95","P99")})
PY
done
exit 0
