import manifest from './manifest.json';
import { playSynth, startAmbientSynth, type SfxName } from './synth';

export type { SfxName };

interface Volumes {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

import type { Howl } from 'howler';

type HowlCtor = typeof Howl;

const sfxFiles = manifest.sfx as Record<SfxName, string | null>;
const musicFiles = manifest.music as Record<'ambient', string | null>;
const hasFiles = Object.values(sfxFiles).some(Boolean) || Object.values(musicFiles).some(Boolean);

/**
 * Audio facade. Starts on the first user gesture (autoplay policy). Uses real files via
 * Howler (lazy-loaded) when the manifest lists them, otherwise WebAudio synthesis.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private stopAmbient: (() => void) | null = null;
  private Howl: HowlCtor | null = null;
  private howls = new Map<string, InstanceType<HowlCtor>>();
  private vol: Volumes = { master: 0.8, music: 0.5, sfx: 0.8, muted: false };
  private ducked = false;
  private ambientWanted = false;
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
    this.musicBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolumes();
    if (hasFiles) {
      void import('howler').then((m) => {
        this.Howl = m.Howl;
        if (this.ambientWanted) this.startAmbient();
      });
    }
    if (this.ambientWanted) this.startAmbient();
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
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.muted ? 0 : this.vol.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * (this.ducked ? 0.35 : 1), t, 0.25);
    const scale = this.vol.muted ? 0 : this.vol.master;
    this.howls.forEach((h, key) => h.volume(scale * (key === 'ambient' ? this.vol.music : this.vol.sfx)));
  }

  /** Lowers music while modals are open. */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.applyVolumes();
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

  startAmbient(): void {
    this.ambientWanted = true;
    if (!this.ctx || !this.musicBus || this.stopAmbient) return;
    const file = musicFiles.ambient;
    if (file) {
      if (!this.Howl) return; // will start once howler loads
      const h = new this.Howl({ src: [`/audio/${file}`], loop: true, volume: this.vol.master * this.vol.music });
      this.howls.set('ambient', h);
      h.play();
      this.stopAmbient = () => h.stop();
      return;
    }
    this.stopAmbient = startAmbientSynth(this.ctx, this.musicBus);
  }

  stopAmbientBed(): void {
    this.ambientWanted = false;
    this.stopAmbient?.();
    this.stopAmbient = null;
  }
}

export const audio = new AudioEngine();
