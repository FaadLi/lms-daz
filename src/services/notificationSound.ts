let audio: AudioContext | undefined;
export function unlockNotificationSound() {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch { /* Audio is optional and may be blocked by the browser. */ }
}
export function playNotificationSound() {
  if (!audio || audio.state!=='running' || !document.hasFocus() || document.visibilityState!=='visible') return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(660,audio.currentTime);
  oscillator.frequency.setValueAtTime(880,audio.currentTime+0.09);
  gain.gain.setValueAtTime(0.04,audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001,audio.currentTime+0.2);
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.start(); oscillator.stop(audio.currentTime+0.21);
  oscillator.onended = () => {oscillator.disconnect();gain.disconnect();};
}
export function clearNotificationSound() {
  if (audio) void audio.close().catch(() => {});
  audio = undefined;
}
