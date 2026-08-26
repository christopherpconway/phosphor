// src/cockpit/sound.ts
// Synthesized UI sounds. No audio files: keeps the repo clean of GPL assets.
let ctx: AudioContext | null = null;
let enabled = false;

const ac = () => (ctx ??= new AudioContext());

function beep(freq: number, ms: number, gain: number, type: OscillatorType) {
  if (!enabled) return;
  const a = ac();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000);
  osc.connect(g).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + ms / 1000);
}

export const sound = {
  setEnabled(on: boolean) {
    enabled = on;
  },
  keystroke() {
    beep(1400, 18, 0.02, "square");
  },
  blip() {
    beep(620, 60, 0.03, "sine");
  },
};
