export type MusicNote = { channel: number; pitch: number; beat: number; duration: number; velocity: number };
export type MusicScore = { bpm: number; beats: number; notes: MusicNote[] };

/** Original score playback: look ahead on the audio clock, including across loop boundaries. */
export class BackgroundMusicPlayer {
  readonly context = new AudioContext();
  private readonly gain = this.context.createGain();
  private readonly mix = this.context.createGain();
  private timer: ReturnType<typeof setInterval> | undefined;
  private index = 0;
  private loop = 0;
  private origin = 0;
  private disposed = false;
  private started = false;
  private ramp = { from: 0, to: 0, start: 0, end: 0 };

  constructor() {
    this.gain.gain.value = 0;
    this.gain.connect(this.context.destination);
    this.mix.connect(this.gain);
    // A quiet filtered echo gives the sparse notes space; tails cross the loop seam.
    const delay = this.context.createDelay(2);
    const feedback = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    delay.delayTime.value = .43;
    feedback.gain.value = .22;
    filter.frequency.value = 1800;
    this.mix.connect(delay);
    delay.connect(filter);
    filter.connect(feedback);
    feedback.connect(delay);
    filter.connect(this.gain);
  }

  async start(score: MusicScore) {
    if (this.disposed || this.started) return;
    this.started = true;
    this.origin = this.context.currentTime + .1;
    const seconds = 60 / score.bpm;
    const schedule = () => {
      if (this.disposed || this.context.state !== 'running') return;
      const horizon = this.context.currentTime + .35;
      // A background-tab stall must not enqueue minutes of old notes at once.
      const elapsed = (this.context.currentTime - this.origin) / seconds;
      if (elapsed > (this.loop * score.beats + score.notes[this.index].beat) + 1) {
        this.loop = Math.max(0, Math.floor(elapsed / score.beats));
        this.index = score.notes.findIndex((note) => note.beat >= elapsed - this.loop * score.beats);
        if (this.index < 0) { this.index = 0; this.loop++; }
      }
      while (true) {
        const note = score.notes[this.index];
        const time = this.origin + (this.loop * score.beats + note.beat) * seconds;
        if (time > horizon) break;
        this.voice(note, Math.max(time, this.context.currentTime), note.duration * seconds);
        if (++this.index === score.notes.length) { this.index = 0; this.loop++; }
      }
    };
    schedule();
    this.timer = setInterval(schedule, 100);
  }

  setLevel(level: number, duration: number) {
    const now = this.context.currentTime;
    const previous = this.ramp;
    const progress = previous.end <= previous.start ? 1 : Math.min(1, Math.max(0, (now - previous.start) / (previous.end - previous.start)));
    const current = previous.from + (previous.to - previous.from) * progress;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(current, now);
    this.gain.gain.linearRampToValueAtTime(level, now + duration);
    this.ramp = { from: current, to: level, start: now, end: now + duration };
  }

  private voice(note: MusicNote, time: number, duration: number) {
    const frequency = 440 * 2 ** ((note.pitch - 69) / 12);
    const envelope = this.context.createGain();
    const pan = this.context.createStereoPanner();
    pan.pan.value = [0, -.2, .3, -.1, .4][note.channel];
    envelope.connect(pan); pan.connect(this.mix);
    const pad = note.channel === 0;
    const attack = pad ? 1.2 : note.channel === 3 ? .22 : .009;
    const release = pad ? 1.3 : .5;
    const end = time + duration + release;
    const level = note.velocity / 127 * (pad ? .12 : .2);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(level, time + Math.min(attack, duration / 2));
    if (pad || note.channel === 3) envelope.gain.setValueAtTime(level, time + duration);
    else envelope.gain.exponentialRampToValueAtTime(.001, time + duration);
    envelope.gain.linearRampToValueAtTime(0, end);
    // Zither: a bright plucked fundamental and rapidly decaying string harmonics.
    const partials = note.channel === 2 ? [1, 2, 3, 5] : note.channel === 4 ? [1, 2.76] : [1, 2];
    let remaining = partials.length;
    partials.forEach((ratio, i) => {
      const oscillator = this.context.createOscillator();
      const harmonic = this.context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency * ratio;
      harmonic.gain.setValueAtTime(i === 0 ? 1 : .18 / i, time);
      if (note.channel === 2 && i > 0) harmonic.gain.exponentialRampToValueAtTime(.001, time + .3 + .2 / i);
      oscillator.connect(harmonic); harmonic.connect(envelope);
      oscillator.onended = () => {
        oscillator.disconnect(); harmonic.disconnect();
        if (--remaining === 0) { envelope.disconnect(); pan.disconnect(); }
      };
      oscillator.start(time); oscillator.stop(end);
    });
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
    void this.context.close();
  }
}
