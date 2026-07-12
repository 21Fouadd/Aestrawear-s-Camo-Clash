export type ZombieSoundId = "spawn" | "attack" | "hurt" | "death";

type PlayOptions = {
  pan?: number;
  entityId?: number;
  volume?: number;
};

const SOUND_FILES: Record<ZombieSoundId, string[]> = {
  spawn: ["/audio/zombie-groan-1.ogg", "/audio/zombie-groan-2.ogg"],
  attack: ["/audio/zombie-attack.ogg"],
  // Hurt uses a short, pitched slice of the attack recording. Reusing the
  // full death recording here made rapid hits sound like repeated kills.
  hurt: ["/audio/zombie-attack.ogg"],
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

const GLOBAL_COOLDOWN_MS: Record<ZombieSoundId, number> = {
  spawn: 1400,
  attack: 90,
  hurt: 45,
  death: 55,
};

const VOICE_LIMIT: Record<ZombieSoundId, number> = {
  spawn: 2,
  attack: 3,
  hurt: 2,
  death: 2,
};

const PRIORITY: Record<ZombieSoundId, number> = {
  spawn: 0,
  hurt: 1,
  attack: 2,
  death: 3,
};

const PROFILE: Record<ZombieSoundId, {
  minRate: number;
  maxRate: number;
  maxDuration: number;
  attack: number;
  release: number;
}> = {
  spawn: { minRate: 0.84, maxRate: 1.06, maxDuration: 2.6, attack: 0.025, release: 0.2 },
  attack: { minRate: 0.92, maxRate: 1.12, maxDuration: 1, attack: 0.008, release: 0.12 },
  hurt: { minRate: 1.15, maxRate: 1.36, maxDuration: 0.34, attack: 0.006, release: 0.07 },
  death: { minRate: 0.78, maxRate: 1, maxDuration: 1.9, attack: 0.012, release: 0.18 },
};

type ActiveVoice = {
  source: AudioBufferSourceNode;
  sound: ZombieSoundId;
  priority: number;
  startedAt: number;
};

export class ZombieAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private active = new Map<AudioBufferSourceNode, ActiveVoice>();
  private accents = new Set<OscillatorNode>();
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
    if (now - (this.lastPlayed.get(`global:${sound}`) ?? -Infinity) < GLOBAL_COOLDOWN_MS[sound]) return;
    this.lastPlayed.set(cooldownKey, now);
    this.lastPlayed.set(`global:${sound}`, now);

    if (!this.reserveVoice(sound)) return;

    const path = candidates[Math.floor(Math.random() * candidates.length)];
    const source = context.createBufferSource();
    const buffer = this.buffers.get(path)!;
    const profile = PROFILE[sound];
    source.buffer = buffer;
    const playbackRate = profile.minRate + Math.random() * (profile.maxRate - profile.minRate);
    source.playbackRate.value = playbackRate;
    const gain = context.createGain();
    const level = (options.volume ?? DEFAULT_VOLUME[sound]) * (0.88 + Math.random() * 0.16);
    const sourceDuration = Math.min(buffer.duration, profile.maxDuration);
    const duration = sourceDuration / playbackRate;
    const releaseStart = Math.max(profile.attack + 0.01, duration - profile.release);
    const startTime = context.currentTime;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), startTime + profile.attack);
    gain.gain.setValueAtTime(Math.max(0.0001, level), startTime + releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    const panner = context.createStereoPanner();
    const pan = Math.max(-0.8, Math.min(0.8, options.pan ?? 0));
    panner.pan.value = pan;
    source.connect(gain).connect(panner).connect(master);
    this.active.set(source, { source, sound, priority: PRIORITY[sound], startedAt: now });
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    source.start(0, 0, sourceDuration);
    this.playBodyLayer(sound, pan, level);
  }

  dispose() {
    for (const voice of this.active.values()) {
      try { voice.source.stop(); } catch { /* already stopped */ }
    }
    this.active.clear();
    for (const accent of this.accents) {
      try { accent.stop(); } catch { /* already stopped */ }
    }
    this.accents.clear();
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

  private reserveVoice(sound: ZombieSoundId) {
    const sameSound = [...this.active.values()]
      .filter((voice) => voice.sound === sound)
      .sort((a, b) => a.startedAt - b.startedAt);
    if (sameSound.length >= VOICE_LIMIT[sound]) this.stopVoice(sameSound[0]);

    if (this.active.size < 7) return true;
    const incomingPriority = PRIORITY[sound];
    const victim = [...this.active.values()]
      .filter((voice) => voice.priority <= incomingPriority)
      .sort((a, b) => a.priority - b.priority || a.startedAt - b.startedAt)[0];
    if (!victim) return false;
    this.stopVoice(victim);
    return true;
  }

  private stopVoice(voice: ActiveVoice) {
    this.active.delete(voice.source);
    try { voice.source.stop(); } catch { /* already stopped */ }
  }

  private playBodyLayer(sound: ZombieSoundId, pan: number, volume: number) {
    const context = this.context;
    const master = this.master;
    if (!context || !master || (sound !== "attack" && sound !== "death")) return;

    const nowMs = performance.now();
    const layerKey = `layer:${sound}`;
    const layerCooldown = sound === "attack" ? 120 : 90;
    if (nowMs - (this.lastPlayed.get(layerKey) ?? -Infinity) < layerCooldown) return;
    this.lastPlayed.set(layerKey, nowMs);

    const duration = sound === "attack" ? 0.12 : 0.28;
    const startFrequency = sound === "attack" ? 135 : 110;
    const endFrequency = sound === "attack" ? 66 : 46;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const startTime = context.currentTime;
    oscillator.type = sound === "attack" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, volume * (sound === "attack" ? 0.055 : 0.11)), startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    panner.pan.value = pan;
    oscillator.connect(gain).connect(panner).connect(master);
    this.accents.add(oscillator);
    oscillator.onended = () => {
      this.accents.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  private applyGain(seconds: number) {
    if (!this.context || !this.master) return;
    const target = this.muted || this.paused ? 0 : 0.82;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(target, this.context.currentTime, Math.max(0.01, seconds));
  }
}
