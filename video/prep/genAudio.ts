// Generates synth SFX + a background loop as WAV files.
// Run from repo root: pnpm exec tsx video/prep/genAudio.ts
import fs from "node:fs";
import path from "node:path";

const RATE = 44100;
const OUT_DIR = path.resolve(import.meta.dirname, "..", "public", "audio");

// Triangle-ish soft synth (site is sleek, not chippy square-wave)
function tone(freq: number, seconds: number, gain = 0.4, decay = 6): Float32Array {
  const n = Math.floor(RATE * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.exp(-decay * t);
    const phase = (t * freq) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const sin = Math.sin(2 * Math.PI * freq * t);
    out[i] = (0.6 * sin + 0.4 * tri) * gain * env;
  }
  return out;
}

function concat(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function mix(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

function writeWav(file: string, samples: Float32Array): void {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 0x7fff), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  console.log(`wrote ${file} (${(samples.length / RATE).toFixed(2)}s)`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// SFX
writeWav(path.join(OUT_DIR, "sfx-blip.wav"), tone(880, 0.1, 0.5, 16));
writeWav(path.join(OUT_DIR, "sfx-tick.wav"), tone(1320, 0.06, 0.35, 28));
writeWav(
  path.join(OUT_DIR, "sfx-chaching.wav"),
  concat([tone(660, 0.12, 0.5, 10), tone(990, 0.26, 0.5, 7)]),
);

// Background loop: Am–F–C–G arpeggios, dreamy synth, 8 bars @ 120bpm (~8s)
const CHORDS: number[][] = [
  [220, 261.63, 329.63], // Am
  [174.61, 220, 261.63], // F
  [130.81, 164.81, 196], // C
  [196, 246.94, 293.66], // G
];
const EIGHTH = 0.25; // 120bpm
const bars: Float32Array[] = [];
for (let rep = 0; rep < 2; rep++) {
  for (const chord of CHORDS) {
    const arp = [0, 1, 2, 1, 0, 1, 2, 1].map((idx) =>
      tone(chord[idx] * 2, EIGHTH, 0.15, 2.5),
    );
    const bass = tone(chord[0] / 2, EIGHTH * 8, 0.12, 0.4);
    bars.push(mix(concat(arp), bass));
  }
}
writeWav(path.join(OUT_DIR, "loop-spectral.wav"), concat(bars));
