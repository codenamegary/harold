#define _GNU_SOURCE
#include <stdlib.h>

/*
 * The Android emulator wrapper strips QEMU_* variables before spawning the
 * QEMU binary, so the built-in WAV audio backend cannot be selected from the
 * shell. This shim runs inside QEMU and restores the values the WAV driver
 * needs. Paths are passed through HAROLD_WAV_IN / HAROLD_WAV_OUT so the same
 * shim works for every capture run.
 */
__attribute__((constructor)) static void harold_audio_env(void) {
    const char *in_path = getenv("HAROLD_WAV_IN");
    const char *out_path = getenv("HAROLD_WAV_OUT");

    setenv("QEMU_AUDIO_DRV", "wav", 1);
    if (in_path && *in_path) {
        setenv("QEMU_WAV_IN_PATH", in_path, 1);
    }
    if (out_path && *out_path) {
        setenv("QEMU_WAV_PATH", out_path, 1);
    }
}
