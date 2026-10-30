import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CharacterLook, KingdomDecor } from '@hexfall/net';
import { Avatar } from './avatar';
import { DecorBuilder } from './decor';
import PLANS from './buildings.json';

interface Props {
  /** 'character': the player turning on a plinth; 'cottage' / 'hall': a furnished room. */
  kind: 'character' | 'cottage' | 'hall';
  look: CharacterLook;
  color: string;
  decor?: KingdomDecor;
  reduce?: boolean;
}

const ROOM = { cottage: { w: 4.2, d: 3.8, h: 2.6, floor: 0.3 }, hall: { w: 7, d: 5, h: 3.6, floor: 0.36 } };

/**
 * A small live 3D view for the Character and My kingdom screens. It shares the walk's models
 * (the avatar and the furnishings), so what you design is what you'll see on the island.
 */
export default function Preview({ kind, look, color, decor, reduce = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{ avatar?: Avatar; room?: THREE.Group; set(p: Props): void } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(kind === 'character' ? 30 : 55, 1, 0.05, 100);
    const sun = new THREE.DirectionalLight('#ffe7c4', 2.6);
    sun.position.set(-3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun, new THREE.HemisphereLight('#cfe2ff', '#5a4a36', 1.1));
    const builder = new DecorBuilder();
    const spin = new THREE.Group();
    // The character faces -z; turn it to face the camera to start with.
    spin.rotation.y = kind === 'character' ? Math.PI * 0.85 : 0;
    scene.add(spin);
    let avatar: Avatar | undefined;
    let room: THREE.Group | undefined;

    if (kind === 'character') {
      const plinth = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.85, 0.16, 32),
        new THREE.MeshStandardMaterial({ color: '#3a3f42', roughness: 0.8 }),
      );
      plinth.position.y = -0.08;
      plinth.receiveShadow = true;
      spin.add(plinth);
      avatar = new Avatar(look, color, reduce);
      avatar.setWeapon('sword');
      spin.add(avatar.root);
      camera.position.set(0, 1.35, 4.6);
      camera.lookAt(0, 0.95, 0);
    } else {
      const r = ROOM[kind];
      room = new THREE.Group();
      const plank = new THREE.MeshStandardMaterial({ color: '#7a5a3c', roughness: 0.9 });
      const plaster = new THREE.MeshStandardMaterial({ color: kind === 'hall' ? '#a8a092' : '#d8ccb4', roughness: 1, side: THREE.BackSide });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(r.w, r.floor, r.d), plank);
      floor.position.y = r.floor / 2;
      floor.receiveShadow = true;
      // The walls' bottom sits just under the floor so the two never flicker.
      const walls = new THREE.Mesh(new THREE.BoxGeometry(r.w, r.h + 0.04, r.d), plaster);
      walls.position.y = r.floor + r.h / 2 - 0.02;
      walls.receiveShadow = true;
      room.add(floor, walls);
      // The room's own furniture (drawn by the building model in the walk) as simple shapes,
      // so a candle stands on a table here as it will there.
      const wood = new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.9 });
      for (const f of PLANS[kind].furniture) {
        if (f.kind === 'rug' || !f.h) continue;
        const b = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, f.d), wood);
        b.position.set(f.x, r.floor + f.h / 2, f.z);
        b.castShadow = b.receiveShadow = true;
        room.add(b);
      }
      scene.add(room);
      // A dollhouse view from outside: the walls are drawn inside-facing, so the ones between
      // the camera and the room (and the ceiling) drop away by themselves.
      camera.fov = 40;
      sun.position.set(1, r.h + 1, 2);
      const fill = new THREE.PointLight('#ffd9a0', 6, 12, 1.6);
      fill.position.set(0, r.floor + r.h - 0.4, 0);
      scene.add(fill);
    }
    let decorGroup: THREE.Group | null = null;
    const set = (p: Props) => {
      avatar?.setLook(p.look);
      avatar?.setSeatColor(p.color);
      if (room && p.decor && p.kind !== 'character') {
        decorGroup?.removeFromParent();
        decorGroup = builder.room(p.kind, p.decor[p.kind], p.decor.tint, ROOM[p.kind].floor).group;
        room.add(decorGroup);
      }
    };
    live.current = { avatar, room, set };
    set({ kind, look, color, decor, reduce });

    const resize = () => {
      const w = el.clientWidth || 300;
      const h = el.clientHeight || 300;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let raf = 0;
    let pan = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (kind === 'character') {
        if (!reduce) spin.rotation.y += dt * 0.5;
      } else {
        // Circle slowly round the room, looking down into it.
        pan += reduce ? 0 : dt * 0.18;
        const r = ROOM[kind];
        const far = Math.hypot(r.w, r.d) * 1.25;
        const a = 0.55 + Math.sin(pan) * 0.9;
        camera.position.set(Math.sin(a) * far, r.floor + r.h * 2.1, Math.cos(a) * far);
        camera.lookAt(0, r.floor + 0.5, 0);
      }
      avatar?.update(dt, { speed: 0, weapon: 'sword', attackAge: 9, side: 1, block: false, riding: false });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      avatar?.dispose();
      builder.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      live.current = null;
    };
    // The scene is rebuilt only when the kind of preview changes; the rest updates in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, reduce]);

  useEffect(() => {
    live.current?.set({ kind, look, color, decor, reduce });
  }, [kind, look, color, decor, reduce]);

  return <div ref={host} className="h-full w-full" />;
}
