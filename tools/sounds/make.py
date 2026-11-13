#!/usr/bin/env python3
"""Synthesizes Macr's sound theme (sounds/stereo/*.oga) with numpy and ffmpeg.

Every sound is made here from sine waves and filtered noise, in the spirit of
macOS's system sounds; no recorded or third-party audio is used.
Run: python3 tools/sounds/make.py
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

RATE = 48000
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'sounds', 'stereo')
rng = np.random.default_rng(7)


def t(seconds):
    return np.arange(int(seconds * RATE)) / RATE


def envelope(n, attack, tau):
    x = np.arange(n) / RATE
    env = np.exp(-x / tau)
    a = max(1, int(attack * RATE))
    env[:a] *= np.linspace(0, 1, a)
    return env


def bandpass(signal, low, high):
    spectrum = np.fft.rfft(signal)
    freqs = np.fft.rfftfreq(len(signal), 1 / RATE)
    spectrum[(freqs < low) | (freqs > high)] = 0
    return np.fft.irfft(spectrum, len(signal))


def bell(freq, seconds, tau, partials=((1, 1.0), (2.76, 0.25), (5.4, 0.08)), attack=0.003):
    x = t(seconds)
    tone = sum(level * np.sin(2 * np.pi * freq * ratio * x) * np.exp(-x / (tau / ratio ** 0.5)) for ratio, level in partials)
    return tone * envelope(len(x), attack, 10)


def place(total, *parts):
    out = np.zeros(int(total * RATE))
    for start, sound in parts:
        i = int(start * RATE)
        n = min(len(sound), len(out) - i)
        out[i:i + n] += sound[:n]
    return out


def pop():
    x = t(0.09)
    freq = 620 + 380 * np.exp(-x / 0.012)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    tone = np.sin(phase) + 0.15 * np.sin(2 * phase)
    return tone * envelope(len(x), 0.0015, 0.018)


def click(level):
    n = int(0.03 * RATE)
    noise = bandpass(rng.standard_normal(n), 1800, 7000) * envelope(n, 0.0005, 0.004)
    x = t(0.03)
    thump = np.sin(2 * np.pi * 170 * x) * envelope(n, 0.001, 0.008) * 0.6
    return level * (noise / np.abs(noise).max() + thump)


def shutter():
    return place(0.22, (0, click(1.0)), (0.085, click(0.7)))


def crumple():
    total = 0.85
    out = np.zeros(int(total * RATE))
    for _ in range(140):
        start = rng.beta(1.6, 2.2) * (total - 0.02)
        n = int(rng.uniform(0.001, 0.008) * RATE)
        burst = rng.standard_normal(n) * envelope(n, 0.0003, rng.uniform(0.0008, 0.003)) * rng.uniform(0.2, 1)
        i = int(start * RATE)
        out[i:i + n] += burst
    out = bandpass(out, 900, 8000)
    rustle = bandpass(rng.standard_normal(len(out)), 300, 2500) * 0.04 * np.sin(np.pi * np.arange(len(out)) / len(out))
    return out + rustle


def boop(freq):
    x = t(0.38)
    f = freq * (1 - 0.06 * (1 - np.exp(-x / 0.08)))
    phase = 2 * np.pi * np.cumsum(f) / RATE
    tone = np.sin(phase) + 0.18 * np.sin(2 * phase) + 0.05 * np.sin(3 * phase)
    return tone * envelope(len(x), 0.004, 0.11)


def chime():
    return bell(1568, 1.1, 0.42) + 0.35 * bell(2093, 1.1, 0.3)


def ding():
    return place(0.8, (0, bell(1318.5, 0.75, 0.22)), (0.075, 0.8 * bell(1760, 0.72, 0.26)))


def done():
    return place(0.7, (0, bell(1046.5, 0.6, 0.18)), (0.095, bell(1568, 0.6, 0.22)))


SOUNDS = {
    'audio-volume-change': pop,
    'screen-capture': shutter,
    'camera-shutter': shutter,
    'trash-empty': crumple,
    'power-plug': chime,
    'bell': lambda: boop(560),
    'dialog-warning': lambda: boop(560),
    'dialog-error': lambda: boop(420),
    'message-new-instant': ding,
    'message': ding,
    'complete': done,
}


def write(name, signal):
    signal = signal / np.abs(signal).max() * 0.5
    fade = int(0.004 * RATE)
    signal[-fade:] *= np.linspace(1, 0, fade)
    pcm = (np.repeat(signal[:, None], 2, axis=1) * 32767).astype('<i2')
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        with wave.open(tmp.name, 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp.name, '-c:a', 'libvorbis', '-q:a', '5', '-map_metadata', '-1',
                        '-fflags', '+bitexact', '-flags:a', '+bitexact', os.path.join(OUT, f'{name}.oga')], check=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, make in SOUNDS.items():
        write(name, make())
    print(f'{len(SOUNDS)} sounds in {os.path.normpath(OUT)}')
