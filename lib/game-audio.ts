export type ZombieSoundId = "spawn" | "attack" | "hurt" | "death";

type PlayOptions = {
  pan?: number;
  entityId?: number;
  volume?: number;
};

const SOUND_FILES: Record<ZombieSoundId, string[]> = {
  spawn: ["/audio/zombie-groan-1.ogg", "/audio/zombie-groan-2.ogg"],
  attack: ["/audio/zombie-attack.ogg"],
  hurt: ["/audio/zombie-attack.ogg", "/audio/zombie-death.ogg"],
  death: ["/audio/zombie-death.ogg"],
};

const DEFAULT_VOLUME: Record<ZombieSoundId, number> = {
  spawn: 0.42,
  attack: 0.5,
  hurt: 0.28,
  death: 0.6,
};

const COOLDOWN_MS: Record<ZombieSoundId, number> = {
  spawn: 1400,
  attack: 320,
  hurt: 140,
  death: 80,
};

export class ZombieAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private active = new Set<AudioBufferSourceNode>();
  private lastPlayed = new Map<string, number>();
  private loadPromise: Promise<void> | null = null;
  private muted = false;
  private paused = true;

  async unlock() {
    if (typeof window === "undefined") return;
    if (!this.context) {
      const AudioContextClass = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 10;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.16;
      this.master.connect(compressor).connect(this.context.destination);
      this.applyGain(0);
    }

    const resume = this.context.state === "suspended" ? this.context.resume() : Promise.resolve();
    if (!this.loadPromise) this.loadPromise = this.loadSounds();
    await resume.catch(() => undefined);
    await this.loadPromise;
    if (this.context.state === "running") {
      const silent = this.context.createBufferSource();
      silent.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
      silent.connect(this.master!);
      silent.start();
    }
    this.applyGain(0.06);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyGain(0.04);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.applyGain(0.08);
  }

  play(sound: ZombieSoundId, options: PlayOptions = {}) {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== "running" || this.muted || this.paused) return;
    const candidates = SOUND_FILES[sound].filter((path) => this.buffers.has(path));
    if (candidates.length === 0) return;

    const cooldownKey = sound === "spawn" ? sound : `${sound}:${options.entityId ?? "global"}`;
    const now = performance.now();
    if (now - (this.lastPlayed.get(cooldownKey) ?? -Infinity) < COOLDOWN_MS[sound]) return;
    this.lastPlayed.set(cooldownKey, now);

    if (this.active.size >= 7) {
      const oldest = this.active.values().next().value as AudioBufferSourceNode | undefined;
      oldest?.stop();
    }

    const path = candidates[Math.floor(Math.random() * candidates.length)];
    const source = context.createBufferSource();
    source.buffer = this.buffers.get(path)!;
    source.playbackRate.value = 0.92 + Math.random() * 0.16;
    const gain = context.createGain();
    gain.gain.value = (options.volume ?? DEFAULT_VOLUME[sound]) * (0.88 + Math.random() * 0.16);
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-0.8, Math.min(0.8, options.pan ?? 0));
    source.connect(gain).connect(panner).connect(master);
    this.active.add(source);
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    source.start();
  }

  dispose() {
    for (const source of this.active) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.active.clear();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.buffers.clear();
  }

  private async loadSounds() {
    const context = this.context;
    if (!context) return;
    const paths = [...new Set(Object.values(SOUND_FILES).flat())];
    await Promise.all(paths.map(async (path) => {
      try {
        const response = await fetch(path);
        if (!response.ok) return;
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(path, buffer);
      } catch {
        // Audio is optional; unsupported codecs or interrupted fetches fail silently.
      }
    }));
  }

  private applyGain(seconds: number) {
    if (!this.context || !this.master) return;
    const target = this.muted || this.paused ? 0 : 0.82;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(target, this.context.currentTime, Math.max(0.01, seconds));
  }
}
