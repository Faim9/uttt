/**
 * Short sounds, synthesized with Web Audio so there are no files to load. Browsers only allow sound after
 * the visitor has interacted with the page; until then playing does nothing. Muting is remembered here.
 */

type Sound = 'move' | 'board' | 'start' | 'end' | 'lowTime' | 'wrong' | 'solved';

/** Each sound's notes: frequency (Hz), start and length (seconds). */
// prettier-ignore
const SOUNDS: Record<Sound, { wave: OscillatorType; volume: number; notes: number[][] }> = {
  move: { wave: 'triangle', volume: 0.25, notes: [[440, 0, 0.07]] },
  board: { wave: 'sine', volume: 0.2, notes: [[660, 0, 0.18], [990, 0.07, 0.25]] },
  start: { wave: 'sine', volume: 0.2, notes: [[523, 0, 0.15], [784, 0.12, 0.3]] },
  end: { wave: 'sine', volume: 0.2, notes: [[784, 0, 0.2], [659, 0.15, 0.2], [523, 0.3, 0.45]] },
  lowTime: { wave: 'square', volume: 0.06, notes: [[1200, 0, 0.05], [1200, 0.15, 0.05]] },
  wrong: { wave: 'sawtooth', volume: 0.08, notes: [[180, 0, 0.25]] },
  solved: { wave: 'sine', volume: 0.2, notes: [[523, 0, 0.15], [659, 0.1, 0.15], [784, 0.2, 0.4]] },
};
const KEY = 'sound';

export const sound = $state({ on: true });
let context: AudioContext | null = null;

/** Call once in the browser, from the layout. */
export function loadSoundSetting(): void {
  try {
    sound.on = localStorage.getItem(KEY) !== 'off';
  } catch {
    // Blocked storage: sound stays on.
  }
}

export function setSound(on: boolean): void {
  sound.on = on;
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // The choice lasts until the page is closed.
  }
}

export function playSound(name: Sound): void {
  if (!sound.on || !navigator.userActivation?.hasBeenActive) return;
  context ??= new AudioContext();
  const { wave, volume, notes } = SOUNDS[name];
  const now = context.currentTime;
  for (const [frequency, start, length] of notes) {
    const oscillator = new OscillatorNode(context, { type: wave, frequency });
    const gain = new GainNode(context);
    gain.gain.setValueAtTime(volume, now + start);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + length);
  }
}
