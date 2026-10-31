/**
 * Audio helpers for the render scripts, run in the page: spectrum statistics
 * of a rendered buffer and WAV encoding.
 */

/**
 * Spectral centroid and band shares (under 400 Hz, to 2.5 kHz, above it, and
 * the part above 5 kHz, where a harsh or buzzy tone shows) over about 0.68 s
 * from `start`.
 */
export function stats(buffer, start, seconds = 0.68) {
  const SR = buffer.sampleRate;
  const N = 32768;
  const data = buffer.getChannelData(0);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const s0 = Math.floor(start * SR);
  for (let i = 0; i < N && s0 + i < data.length; i++) {
    re[i] = data[s0 + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  // Iterative radix-2 FFT.
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
    }
  }
  let total = 0;
  let weighted = 0;
  const bands = { low: 0, mid: 0, high: 0, air: 0 };
  for (let k = 1; k < N / 2; k++) {
    const hz = (k * SR) / N;
    const p = re[k] ** 2 + im[k] ** 2;
    total += p;
    weighted += p * hz;
    if (hz < 400) bands.low += p;
    else if (hz < 2500) bands.mid += p;
    else bands.high += p;
    if (hz >= 5000) bands.air += p;
  }
  const pct = (v) => Math.round((100 * v) / total);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  return {
    centroidHz: Math.round(weighted / total),
    lowPct: pct(bands.low),
    midPct: pct(bands.mid),
    highPct: pct(bands.high),
    above5kPct: pct(bands.air),
    peak: +peak.toFixed(2),
  };
}

export function wavBase64(buffer) {
  const SR = buffer.sampleRate;
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const bytes = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  bytes.setUint32(4, 36 + len * ch * 2, true);
  str(8, 'WAVEfmt ');
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, ch, true);
  bytes.setUint32(24, SR, true);
  bytes.setUint32(28, SR * ch * 2, true);
  bytes.setUint16(32, ch * 2, true);
  bytes.setUint16(34, 16, true);
  str(36, 'data');
  bytes.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  for (let i = 0, o = 44; i < len; i++) {
    for (let c = 0; c < ch; c++, o += 2) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      bytes.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
  }
  let bin = '';
  const u8 = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
