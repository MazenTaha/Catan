import manifest from './manifest.json';
import { playSynth, type SfxName } from './synth';

export type { SfxName };

interface Volumes {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

import type { Howl } from 'howler';

type HowlCtor = typeof Howl;

const sfxFiles = manifest.sfx as Record<SfxName, string | null>;
const hasFiles = Object.values(sfxFiles).some(Boolean);

/**
 * Audio facade: sound effects, plus the music bus that `music.ts` plays classical pieces on. Starts on the first user gesture (autoplay policy). Uses
 * real files via Howler (lazy-loaded) when the manifest lists them, otherwise WebAudio synthesis.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private unlockListeners: (() => void)[] = [];
  private Howl: HowlCtor | null = null;
  private howls = new Map<string, InstanceType<HowlCtor>>();
  private vol: Volumes = { master: 0.8, sfx: 0.8, music: 0.45, muted: false };
  private lastPlayed = new Map<SfxName, number>();

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolumes();
    for (const fn of this.unlockListeners.splice(0)) fn();
    if (hasFiles) {
      void import('howler').then((m) => {
        this.Howl = m.Howl;
      });
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  setVolumes(v: Volumes): void {
    this.vol = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.muted ? 0 : this.vol.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.musicBus?.gain.setTargetAtTime(this.vol.music * 0.8, t, 0.2);
    const scale = this.vol.muted ? 0 : this.vol.master;
    this.howls.forEach((h) => h.volume(scale * this.vol.sfx));
  }

  /** The context and bus music plays through, once audio is unlocked (null before). */
  musicOut(): { ctx: AudioContext; bus: GainNode } | null {
    return this.ctx && this.musicBus ? { ctx: this.ctx, bus: this.musicBus } : null;
  }

  /** Runs once audio is unlocked (at once if it already is). */
  whenUnlocked(fn: () => void): void {
    if (this.ctx) fn();
    else this.unlockListeners.push(fn);
  }

  play(name: SfxName): void {
    if (!this.ctx || !this.sfxBus || this.vol.muted) return;
    const now = performance.now();
    if ((this.lastPlayed.get(name) ?? 0) > now - 60) return; // de-dupe bursts
    this.lastPlayed.set(name, now);
    const file = sfxFiles[name];
    if (file && this.Howl) {
      let h = this.howls.get(name);
      if (!h) {
        h = new this.Howl({ src: [`/audio/${file}`], volume: this.vol.master * this.vol.sfx });
        this.howls.set(name, h);
      }
      h.play();
      return;
    }
    playSynth(this.ctx, this.sfxBus, name);
  }
}

export const audio = new AudioEngine();
