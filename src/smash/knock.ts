/**
 * The noise of an instrument hitting the floor: a dull knock for a blow it
 * survives, a longer, brighter crack for one that breaks something.
 */

export function makeNoise(ctx: BaseAudioContext, seconds = 0.6): AudioBuffer {
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return noise;
}

/**
 * Plays a knock of `intensity` (0 to 1) into `destination`. `pitch` scales
 * the band the noise sounds in: lower for big wooden cases, higher for
 * small metal ones.
 */
export function playKnock(
  ctx: BaseAudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  intensity: number,
  crack: boolean,
  pitch = 1,
  when = ctx.currentTime,
): void {
  if (ctx instanceof AudioContext && ctx.state !== 'running') return;
  const level = Math.min(1, Math.max(0, intensity));
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = crack ? 1 : 0.5 + 0.3 * level;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = pitch * (crack ? 1800 + 1500 * level : 140 + 260 * level);
  band.Q.value = crack ? 0.7 : 1.4;
  const gain = ctx.createGain();
  const length = crack ? 0.45 : 0.12;
  gain.gain.setValueAtTime((crack ? 0.9 : 1.4) * level + 0.001, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + length);
  source.connect(band).connect(gain).connect(destination);
  source.start(when);
  source.stop(when + length + 0.02);
  source.onended = () => {
    band.disconnect();
    gain.disconnect();
  };
}
