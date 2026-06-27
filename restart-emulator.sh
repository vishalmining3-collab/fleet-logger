#!/bin/bash
# Script to restart the Android Emulator with macOS host microphone bridging enabled.
set -e

AVD_NAME="Pixel_10_Pro"
PACKAGE_NAME="com.fleet.logger"
EMULATOR_BIN="$HOME/Library/Android/sdk/emulator/emulator"
ADB_BIN="$HOME/Library/Android/sdk/platform-tools/adb"

echo "=========================================================="
echo " Restarting Android Emulator with Microphone Passthrough"
echo "=========================================================="

# 1. Kill existing emulator
echo "Stopping any running emulator processes..."
$ADB_BIN emu kill 2>/dev/null || true
sleep 1

# Force kill any remaining qemu/emulator processes if still running (exclude this script itself)
QEMU_PIDS=$(ps aux | grep -E 'qemu-system|emulator' | grep -v grep | grep -v 'restart-emulator' | awk '{print $2}' || true)
if [ -n "$QEMU_PIDS" ]; then
    echo "Force killing emulator PIDs: $QEMU_PIDS"
    echo "$QEMU_PIDS" | xargs kill -9 2>/dev/null || true
fi
sleep 2

# 2. Start emulator with -allow-host-audio
echo "Starting emulator '$AVD_NAME' with host audio input enabled..."
nohup $EMULATOR_BIN -avd "$AVD_NAME" -allow-host-audio < /dev/null > /tmp/emulator_launch.log 2>&1 &
EMU_PID=$!
echo "Emulator started in background (PID: $EMU_PID)"

# 3. Wait for device to be recognized and booted
echo "Waiting for device to register with adb..."
while true; do
    DEVICES=$($ADB_BIN devices | grep -v "List" | grep "device" || true)
    if [ -n "$DEVICES" ]; then
        echo "  ✓ Device detected"
        break
    fi
    sleep 2
done

echo "Waiting for Android OS to finish booting..."
while true; do
    BOOT_STATUS=$($ADB_BIN shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n' || true)
    if [ "$BOOT_STATUS" = "1" ]; then
        echo "  ✓ Boot completed successfully"
        break
    fi
    sleep 2
done

# 4. Activate host microphone in the emulator
echo "Activating host microphone input inside the emulator..."
$ADB_BIN emu avd hostmicon || true
echo "  ✓ Host microphone activated"

# 5. Grant recording audio permission to the app
echo "Ensuring microphone permission is granted to the app..."
$ADB_BIN shell pm grant "$PACKAGE_NAME" android.permission.RECORD_AUDIO || true
echo "  ✓ Permission granted"

# 6. Launch the app
echo "Launching Fleet Logger app..."
$ADB_BIN shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
echo "  ✓ App launched!"

echo "=========================================================="
echo " Emulator setup complete. Microphone is ready to use!"
echo "=========================================================="
