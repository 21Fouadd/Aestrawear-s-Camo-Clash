export type ZombieSoundId = "spawn" | "attack" | "hurt" | "death";
export type GameCueId = "swing" | "impact" | "gun" | "playerHurt" | "pickup" | "reload" | "waveClear";

export type GameCueOptions = {
  pan?: number;
  volume?: number;
  intensity?: number;
};

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
  spawn: 0.5,
  attack: 0.6,
  hurt: 0.34,
  death: 0.72,
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

const CUE_COOLDOWN_MS: Record<GameCueId, number> = {
  swing: 55,
  impact: 45,
  gun: 65,
  playerHurt: 130,
  pickup: 120,
  reload: 100,
  waveClear: 700,
};

const CUE_VOLUME: Record<GameCueId, number> = {
  swing: 0.5,
  impact: 0.66,
  gun: 0.68,
  playerHurt: 0.7,
  pickup: 0.48,
  reload: 0.4,
  waveClear: 0.6,
};

const MAX_ACCENT_OSCILLATORS = 12;

type CueLayer = {
  type: OscillatorType;
  from: number;
  to: number;
  duration: number;
  gain: number;
  attack?: number;
  delay?: number;
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
      compressor.threshold.value = -20;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.14;
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

  resetForRun() {
    this.lastPlayed.clear();
  }

  play(sound: ZombieSoundId, options: PlayOptions = {}) {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== "running" || this.muted || this.paused) return;
    const candidates = SOUND_FILES[sound].filter((path) => this.buffers.has(path));
    if (candidates.length === 0) return;

    const cooldownKey = sound === "spawn" ? sound : `${sound}:${options.entityId ?? "global"}`;
    const now = performance.now();
    this.pruneCooldowns(now);
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

  playCue(cue: GameCueId, options: GameCueOptions = {}) {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== "running" || this.muted || this.paused) return;

    const now = performance.now();
    this.pruneCooldowns(now);
    const cooldownKey = `cue:${cue}`;
    if (now - (this.lastPlayed.get(cooldownKey) ?? -Infinity) < CUE_COOLDOWN_MS[cue]) return;
    this.lastPlayed.set(cooldownKey, now);

    const pan = Math.max(-0.8, Math.min(0.8, options.pan ?? 0));
    const intensity = Math.max(0.35, Math.min(1.4, options.intensity ?? 1));
    const volume = Math.max(0, Math.min(1.25, options.volume ?? 1)) * CUE_VOLUME[cue];
    const pitch = 0.97 + Math.random() * 0.06;
    const layers = this.cueLayers(cue, intensity);
    this.reserveAccents(layers.length);

    for (const layer of layers) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      const startTime = context.currentTime + (layer.delay ?? 0);
      const attack = Math.min(layer.duration * 0.45, layer.attack ?? 0.004);
      const endTime = startTime + layer.duration;
      const peak = Math.max(0.0001, layer.gain * volume * intensity);

      oscillator.type = layer.type;
      oscillator.frequency.setValueAtTime(Math.max(20, layer.from * pitch), startTime);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, layer.to * pitch), endTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(peak, startTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
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
      oscillator.stop(endTime + 0.01);
    }
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

  private cueLayers(cue: GameCueId, intensity: number): CueLayer[] {
    switch (cue) {
      case "swing":
        return [
          { type: "triangle", from: 310, to: 82, duration: 0.085, gain: 0.13, attack: 0.006 },
          ...(intensity > 1.05 ? [{ type: "sine" as OscillatorType, from: 120, to: 54, duration: 0.11, gain: 0.055 }] : []),
        ];
      case "impact":
        return [
          { type: "sine", from: 112, to: 42, duration: 0.115, gain: 0.21, attack: 0.002 },
          { type: "square", from: 230, to: 74, duration: 0.038, gain: 0.045, attack: 0.001 },
        ];
      case "gun":
        return [
          { type: "square", from: 270, to: 52, duration: 0.09, gain: 0.15, attack: 0.001 },
          { type: "sine", from: 88, to: 36, duration: 0.17 + intensity * 0.025, gain: 0.17, attack: 0.002 },
        ];
      case "playerHurt":
        return [
          { type: "sawtooth", from: 175, to: 64, duration: 0.145, gain: 0.075, attack: 0.003 },
          { type: "sine", from: 68, to: 34, duration: 0.19, gain: 0.13, attack: 0.002 },
        ];
      case "pickup":
        return [
          { type: "sine", from: 520, to: 760, duration: 0.1, gain: 0.09, attack: 0.005 },
          { type: "triangle", from: 760, to: 1020, duration: 0.12, gain: 0.07, attack: 0.005, delay: 0.075 },
        ];
      case "reload":
        return [
          { type: "square", from: 1800, to: 760, duration: 0.025, gain: 0.05, attack: 0.001 },
          { type: "square", from: 1250, to: 610, duration: 0.03, gain: 0.045, attack: 0.001, delay: 0.075 },
        ];
      case "waveClear":
        return [
          { type: "triangle", from: 330, to: 345, duration: 0.19, gain: 0.09, attack: 0.012 },
          { type: "triangle", from: 440, to: 460, duration: 0.2, gain: 0.09, attack: 0.012, delay: 0.095 },
          { type: "triangle", from: 660, to: 690, duration: 0.25, gain: 0.1, attack: 0.014, delay: 0.19 },
        ];
    }
  }

  private reserveAccents(incoming: number) {
    while (this.accents.size + incoming > MAX_ACCENT_OSCILLATORS) {
      const oldest = this.accents.values().next().value as OscillatorNode | undefined;
      if (!oldest) break;
      this.accents.delete(oldest);
      try { oldest.stop(); } catch { /* already stopped */ }
    }
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
    this.reserveAccents(1);
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
    const target = this.muted || this.paused ? 0 : 0.96;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(target, this.context.currentTime, Math.max(0.01, seconds));
  }

  private pruneCooldowns(now: number) {
    if (this.lastPlayed.size < 96) return;
    for (const [key, playedAt] of this.lastPlayed) {
      if (now - playedAt > 12_000) this.lastPlayed.delete(key);
    }
  }
}
