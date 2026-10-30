import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { TERRAIN_RESOURCE, getTopology, type GameState, type Weapon } from '@hexfall/engine';
import { DEFAULT_DECOR, DEFAULT_LOOK, cleanDecor, cleanLook, type KingdomDecor } from '@hexfall/net';
import { audio } from '../../audio/engine';
import { COLOR_HEX, COMBAT_TEXT, RESOURCE_NAME, TERRAIN_NAME } from '../../lexicon';
import { liteEffects, onGameEvents, prefersReducedMotion, useStore } from '../../state/store';
import { useNet } from '../../state/net';
import { usePresence } from '../../state/presence';
import { useProfile } from '../../state/profile';
import { setLiteDeferral } from '../../state/frameWatch';
import { PERF_HOOKS } from '../../perfHooks';
import { Icon } from '../../art/icons/Icon';
import { preloadWorldAssets } from './assets';
import { NO_STRESS, parseStress } from './stress';
import { sceneBuilding } from '../../devScenario';
import { World, type RemoteInfo } from './world';
import type { WeaponState } from './combat';
import { hourOf, stageName, daylight } from './daytime';
import { Minimap } from './Minimap';

const topo = getTopology();
const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);
const WEAPON_KEYS: Record<string, Weapon> = { Digit1: 'sword', Digit2: 'revolver', Digit3: 'fist' };
/** Bullets for games that started before weapon chests existed (kept for this visit only). */
const OLD_GAME_BULLETS = 5;

/** The seat's settlements and cities, to spawn at (setup may not have placed any yet). */
function homesOf(state: GameState, seat: number): string[] {
  return Object.entries(state.buildings)
    .filter(([, b]) => b.owner === seat)
    .map(([v]) => v);
}

interface Props {
  state: GameState;
  seat: number;
  /** True when the seat has to place something on the board (only possible in 2D). */
  needsBoard: boolean;
  onExit(): void;
}

/**
 * Third-person island over the right shoulder: WASD / arrows to move, drag to look (or Dive in
 * for mouse look), a thumb-stick on touch screens. The world mirrors the live game (bridges,
 * settlements, cities, robber, the time of day) and, online, the other players walking it.
 */
export default function World3D({ state, seat, needsBoard, onExit }: Props) {
  const lite = useStore((s) => liteEffects(s.settings));
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  const renderScale = useStore((s) => s.settings.renderScale);
  const sensitivity = useStore((s) => s.settings.mouseSensitivity);
  const sensRef = useRef(sensitivity);
  sensRef.current = sensitivity;
  const dispatch = useStore((s) => s.dispatch);
  const openModal = useStore((s) => s.openModal);
  const online = useStore((s) => s.session?.online ?? null);
  const lobby = useNet((s) => s.lobby);
  const profile = useProfile();
  const renderScaleRef = useRef(renderScale);
  renderScaleRef.current = renderScale;
  const adaptive = useStore((s) => s.settings.effects === 'auto');
  const adaptiveRef = useRef(adaptive);
  adaptiveRef.current = adaptive;
  const wrapRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const [hex, setHex] = useState<number | null>(null);
  /** The first frame has been drawn (shaders compile in the background before that). */
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  /** "Open door", "Ride horse", "Open chest"… when something is in reach. */
  const [hint, setHint] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [targetHealth, setTargetHealth] = useState<number | null>(null);
  const [hitCount, setHitCount] = useState(0);
  const [weapon, setWeapon] = useState<WeaponState>({ weapon: 'fist', ammo: 0, armed: false, blocking: false });
  const [diving, setDiving] = useState(false);
  const [riding, setRiding] = useState(false);
  const [oldAmmo, setOldAmmo] = useState(OLD_GAME_BULLETS);
  const touch = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches, []);
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const pvp = !!online && !!state.config.pvp;
  const arms = state.arms;
  const armed = arms ? arms.armed[seat] : true;
  const ammo = arms ? arms.bullets[seat] : oldAmmo;
  const health = arms?.health[seat] ?? 100;
  const duel = state.phase.kind === 'duel' ? state.phase : null;
  const inDuel = !!duel && (duel.challenger === seat || duel.target === seat);
  const foe = inDuel && duel ? (duel.challenger === seat ? duel.target : duel.challenger) : null;
  const hour = hourOf(state);

  /** Each seat's character and furnishings: online from the lobby, here from this profile. */
  const looks = useMemo(() => {
    const out = state.players.map(() => DEFAULT_LOOK);
    lobby?.seats.forEach((s, i) => {
      if (s.kind !== 'open' && s.profile.look) out[i] = cleanLook(s.profile.look);
    });
    out[seat] = profile.look;
    return out;
  }, [lobby, state.players, seat, profile.look]);
  const decor = useMemo(() => {
    const m = new Map<number, KingdomDecor>();
    state.players.forEach((p, i) => {
      if (p.kind !== 'human') return;
      const s = lobby?.seats[i];
      if (online && s && s.kind !== 'open') m.set(i, cleanDecor(s.profile.decor));
      else if (!online) m.set(i, profile.decor ?? DEFAULT_DECOR);
    });
    m.set(seat, profile.decor ?? DEFAULT_DECOR);
    return m;
  }, [lobby, online, state.players, seat, profile.decor]);
  const decorRef = useRef(decor);
  decorRef.current = decor;

  // The world is built once per board; pieces are synced below.
  const boardSeed = state.board.seed;
  useEffect(() => {
    const holder = holderRef.current;
    const wrap = wrapRef.current;
    if (!holder || !wrap) return;
    // Each world draws on a canvas of its own: closing a world gives its WebGL context back,
    // and a lost context can't be reused by the next one.
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full';
    holder.appendChild(canvas);
    let world: World | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    const dev = window as unknown as { __world3d?: { world: World; state: () => GameState } };
    setReady(false);
    setTargetHealth(null);
    // Models and textures load first (once per page), so nothing pops in after the walk opens.
    void preloadWorldAssets().then((assets) => {
      if (cancelled) return;
      let w: World;
      try {
        w = new World(
          canvas,
          stateRef.current.board,
          {
            lite,
            thirdPerson: true,
            playerColor: COLOR_HEX[stateRef.current.players[seat].color],
            look: useProfile.getState().look,
            hour: hourOf(stateRef.current),
            onCombatSound: (event) => audio.play(event),
            onWeaponChange: setWeapon,
            onCombatHealth: (h, hit) => {
              setTargetHealth(h);
              if (hit) setHitCount((n) => n + 1);
            },
            onStrike: (victim, weapon) => dispatch({ type: 'Strike', player: seat, victim, weapon }),
            onFire: () => {
              if (stateRef.current.arms) dispatch({ type: 'Fire', player: seat });
              else setOldAmmo((n) => Math.max(0, n - 1));
            },
            onChestOpened: (full) => {
              if (full) dispatch({ type: 'OpenChest', player: seat });
              else setNotice('Empty… Your weapons must be in your other first settlement.');
            },
            onChestSound: (s) => audio.play(s),
            onRide: setRiding,
            reduceMotion: reduce,
            renderScale: renderScaleRef.current,
            adaptive: adaptiveRef.current,
            onHexChange: (h) => {
              setHex(h);
              setReady(true);
            },
            onBleat: () => audio.play('bleat'),
            onHint: setHint,
            onNotice: setNotice,
            stress: PERF_HOOKS ? parseStress(new URLSearchParams(location.search).get('stress')) : NO_STRESS,
          },
          assets,
        );
      } catch {
        setFailed(true);
        return;
      }
      world = w;
      worldRef.current = w;
      // Dev and benchmark builds: lets inspection scripts place the camera and read the board.
      if (PERF_HOOKS) dev.__world3d = { world: w, state: () => stateRef.current };
      w.setDecor(decorRef.current);
      w.setPieces(stateRef.current);
      // Every visit starts at one of the seat's own settlements or cities, picked at random.
      const scene = sceneBuilding();
      const homes = homesOf(stateRef.current, seat);
      const home = homes[Math.floor(Math.random() * homes.length)];
      if (!(scene && w.goToBuilding(scene)) && !(home && w.spawnAt(home))) w.goTo(0);
      ro = new ResizeObserver(() => w.resize(wrap.clientWidth, wrap.clientHeight));
      ro.observe(wrap);
      w.resize(wrap.clientWidth, wrap.clientHeight);
      wrap.focus({ preventScroll: true });
    });
    return () => {
      cancelled = true;
      ro?.disconnect();
      if (world) {
        if (dev.__world3d?.world === world) delete dev.__world3d;
        world.dispose();
      }
      canvas.remove();
      worldRef.current = null;
    };
  }, [boardSeed, lite, reduce, seat, dispatch]);

  const playerColor = COLOR_HEX[state.players[seat].color];
  useEffect(() => {
    worldRef.current?.setPlayerColor(playerColor);
  }, [playerColor, ready]);
  useEffect(() => {
    worldRef.current?.setLook(profile.look);
  }, [profile.look, ready]);
  useEffect(() => {
    worldRef.current?.setArms(armed, ammo);
  }, [armed, ammo, ready]);
  useEffect(() => {
    if (worldRef.current) worldRef.current.pvp = pvp;
  }, [pvp, ready]);
  useEffect(() => {
    worldRef.current?.setHour(hour);
  }, [hour, ready]);

  // The weapon chest in one starting settlement, nothing in the other (games with chests).
  const chest = arms?.chest[seat] ?? null;
  const starts = arms?.starts?.[seat];
  const decoy = starts?.find((v) => v !== chest) ?? null;
  const chestOpened = !!arms && armed;
  useEffect(() => {
    worldRef.current?.setChests(chest, decoy, chestOpened);
  }, [chest, decoy, chestOpened, ready]);

  useEffect(() => {
    worldRef.current?.setRenderScale(renderScale);
  }, [renderScale]);
  useEffect(() => {
    worldRef.current?.setAdaptive(adaptive);
  }, [adaptive]);
  useEffect(() => {
    setLiteDeferral(() => !!worldRef.current?.adapting);
    return () => setLiteDeferral(null);
  }, []);

  const piecesKey = useMemo(
    () => JSON.stringify([state.buildings, state.causeways, state.wraithHex, [...decor]]),
    [state.buildings, state.causeways, state.wraithHex, decor],
  );
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    w.setDecor(decorRef.current);
    w.setPieces(stateRef.current);
  }, [piecesKey]);

  // ------------------------------------------------------------ online: share and show positions

  useEffect(() => {
    if (!online) return;
    const net = useNet.getState();
    const id = window.setInterval(() => {
      const w = worldRef.current;
      if (w) net.send({ t: 'pose', pose: w.pose() });
    }, 100);
    return () => {
      window.clearInterval(id);
      useNet.getState().send({ t: 'pose', pose: null });
    };
  }, [online]);

  const mySeats = online?.seats;
  useEffect(() => {
    if (!online) return;
    const push = (poses: ReturnType<typeof usePresence.getState>['poses']) => {
      const w = worldRef.current;
      if (!w) return;
      const s = stateRef.current;
      const list: RemoteInfo[] = [];
      poses.forEach((pose, i) => {
        if (!pose || mySeats?.includes(i) || !s.players[i]) return;
        list.push({ seat: i, name: s.players[i].name, color: COLOR_HEX[s.players[i].color], look: looks[i], pose });
      });
      w.setRemotes(list);
    };
    push(usePresence.getState().poses);
    return usePresence.subscribe((p) => push(p.poses));
  }, [online, mySeats, looks, ready]);

  // ------------------------------------------------------------ fight feedback from the game

  useEffect(
    () =>
      onGameEvents((events, s) => {
        const w = worldRef.current;
        const name = (p: number) => s.players[p].name;
        for (const e of events) {
          if (e.type === 'Struck') {
            if (e.victim === seat) {
              if (e.parried) w?.parried();
              else w?.hurt();
            } else if (!e.parried) w?.hurtRemote(e.victim);
          }
          if (e.type === 'Slain' && e.victim === seat) {
            setNotice(
              `${name(e.killer)} slew you${e.resource ? ` and took 1 ${RESOURCE_NAME[e.resource]}` : '. You owe them a card'}. You wake at home.`,
            );
            const homes = homesOf(s, seat);
            const home = homes[Math.floor(Math.random() * homes.length)];
            if (home) w?.spawnAt(home);
          } else if (e.type === 'Slain' && e.killer === seat) {
            setNotice(`You slew ${name(e.victim)}${e.resource ? ` and took 1 ${RESOURCE_NAME[e.resource]}` : '. They owe you a card'}.`);
          }
          if (e.type === 'ChestOpened' && e.player === seat) setNotice('A sword and a revolver with 5 bullets. 1 sword · 2 revolver · 3 fists');
          if (e.type === 'DuelStarted' && (e.target === seat || e.challenger === seat))
            setNotice(`Duel! Find ${name(e.target === seat ? e.challenger : e.target)}: the red ring on your map.`);
        }
      }),
    [seat],
  );

  useEffect(() => {
    if (!showHelp) return;
    const id = window.setTimeout(() => setShowHelp(false), 9000);
    return () => window.clearTimeout(id);
  }, [showHelp]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  // ------------------------------------------------------------ Dive in: mouse look

  const unlockedAt = useRef(0);
  useEffect(() => {
    const wrap = wrapRef.current;
    const onChange = () => {
      const on = document.pointerLockElement === wrap;
      setDiving(on);
      if (!on) {
        unlockedAt.current = performance.now();
        worldRef.current?.setBlock(false);
      }
    };
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== wrap) return;
      worldRef.current?.look(e.movementX * sensRef.current, e.movementY * sensRef.current);
    };
    document.addEventListener('pointerlockchange', onChange);
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('pointerlockchange', onChange);
      document.removeEventListener('mousemove', onMove);
      if (wrap && document.pointerLockElement === wrap) document.exitPointerLock();
    };
  }, []);
  const diveIn = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.focus({ preventScroll: true });
    setShowHelp(false);
    const blocked = () => setNotice('Your browser blocked mouse look. Click the island and try again.');
    try {
      const r = wrap.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(blocked);
    } catch {
      blocked();
    }
  };

  // ------------------------------------------------------------ input

  const refocus = () => wrapRef.current?.focus({ preventScroll: true });
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (WEAPON_KEYS[e.code]) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && !worldRef.current?.selectWeapon(WEAPON_KEYS[e.code]) && e.code !== 'Digit3' && !armed)
        setNotice('No weapons yet: find the chest in one of your first two settlements.');
      return;
    }
    if (e.code === 'KeyF') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) worldRef.current?.attack();
      return;
    }
    // E: chests, horses and doors; it never reaches the game's own keys (Space still works).
    if ((e.code === 'KeyE' || e.key === 'e' || e.key === 'E') && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      worldRef.current?.interact();
      return;
    }
    if (e.key === 'Escape') {
      // Esc first leaves Dive in (the browser does that itself); only a second Esc leaves the walk.
      if (document.pointerLockElement === wrapRef.current || performance.now() - unlockedAt.current < 400) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!useStore.getState().modal) {
        e.preventDefault();
        e.stopPropagation();
        onExit();
      }
      return;
    }
    if (!MOVE_KEYS.has(e.code)) return;
    e.preventDefault();
    worldRef.current?.keys.add(e.code);
    // Once the player starts walking the controls are known: make room for hints.
    if (showHelp && !e.code.startsWith('Shift')) setShowHelp(false);
  };
  const onKeyUp = (e: React.KeyboardEvent) => worldRef.current?.keys.delete(e.code);
  const clearKeys = () => {
    worldRef.current?.keys.clear();
    worldRef.current?.setBlock(false);
  };

  const drags = useRef(
    new Map<
      number,
      { x: number; y: number; stick: boolean; ox: number; oy: number; startX: number; startY: number; moved: boolean }
    >(),
  );
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const wrap = wrapRef.current!;
    wrap.focus({ preventScroll: true });
    // Right button: hold a guard. In Dive in, the left button strikes at once.
    if (e.button === 2) {
      worldRef.current?.setBlock(true);
      return;
    }
    if (document.pointerLockElement === wrap) {
      if (e.button === 0) worldRef.current?.attack();
      return;
    }
    const r = wrap.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    // On touch screens the lower-left area is a thumb-stick; everywhere else drags the view.
    const isStick = e.pointerType !== 'mouse' && x < r.width * 0.45 && y > r.height * 0.45;
    if (isStick) setStick({ ox: x, oy: y, x, y });
    drags.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      stick: isStick,
      ox: x,
      oy: y,
      startX: e.clientX,
      startY: e.clientY,
      moved: e.button !== 0,
    });
    wrap.setPointerCapture(e.pointerId);
    setShowHelp(false);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drags.current.get(e.pointerId);
    const world = worldRef.current;
    if (!d || !world) return;
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6) d.moved = true;
    if (d.stick) {
      const r = wrapRef.current!.getBoundingClientRect();
      const max = 46;
      let dx = e.clientX - r.left - d.ox;
      let dy = e.clientY - r.top - d.oy;
      const l = Math.hypot(dx, dy);
      if (l > max) {
        dx = (dx / l) * max;
        dy = (dy / l) * max;
      }
      world.joy.x = dx / max;
      world.joy.y = dy / max;
      setStick({ ox: d.ox, oy: d.oy, x: d.ox + dx, y: d.oy + dy });
    } else {
      world.look((e.clientX - d.x) * sensRef.current, (e.clientY - d.y) * sensRef.current);
      d.x = e.clientX;
      d.y = e.clientY;
    }
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) {
      worldRef.current?.setBlock(false);
      return;
    }
    const d = drags.current.get(e.pointerId);
    drags.current.delete(e.pointerId);
    if (d && !d.stick && !d.moved && e.type !== 'pointercancel') worldRef.current?.attack();
    if (d?.stick) {
      setStick(null);
      if (worldRef.current) worldRef.current.joy.x = worldRef.current.joy.y = 0;
    }
  };

  const readMap = useCallback(() => worldRef.current?.mapState() ?? null, []);

  // ------------------------------------------------------------ HUD

  const tile = hex !== null ? state.board.hexes[hex] : null;
  const owners =
    hex !== null
      ? [
          ...new Set(
            topo.hexVertices[hex].map((v) => state.buildings[v]?.owner).filter((o): o is number => o !== undefined),
          ),
        ]
      : [];
  const res = tile ? TERRAIN_RESOURCE[tile.terrain] : null;
  const night = daylight(hour) < 0.35;

  return (
    <div
      ref={wrapRef}
      data-world3d
      tabIndex={0}
      role="application"
      aria-label={COMBAT_TEXT.label}
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-lg outline-none ring-gold/60 focus-visible:ring-2"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={clearKeys}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: diving ? 'none' : 'grab', background: '#cfeaff' }}
    >
      <div ref={holderRef} className="h-full w-full" />

      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-abyss/90 p-6 text-center text-bone">
          <div>
            <p className="font-display text-lg text-gold">3D view unavailable</p>
            <p className="mt-1 text-sm text-muted">
              This browser couldn’t start WebGL. The 2D board still has everything you need.
            </p>
            <button className="btn mt-3" onClick={onExit}>
              Back to the 2D board
            </button>
          </div>
        </div>
      )}

      {!failed && !ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-1/60 font-display text-gold">
          Building the island…
        </div>
      )}

      {!failed && ready && (
        <>
          {/* Top left: the minimap, and where you are under it. */}
          <div className="pointer-events-none absolute left-2 top-2 flex max-w-[60%] flex-col items-start gap-1.5">
            <Minimap state={state} seat={seat} read={readMap} foe={foe} />
            <div
              className="rounded-md bg-abyss/75 px-3 py-1.5 text-bone shadow-panel backdrop-blur-sm"
              aria-live="polite"
              data-testid="world-location"
            >
              {tile ? (
                <>
                  <div className="font-display text-[15px] tracking-wide text-gold">
                    {TERRAIN_NAME[tile.terrain]}
                    {tile.token !== null && <span className="num ml-2 text-bone">{tile.token}</span>}
                  </div>
                  <div className="text-[12px] text-muted">
                    {res ? `Produces ${RESOURCE_NAME[res]}` : 'Produces nothing'}
                    {state.wraithHex === hex && <span className="text-ember"> · The robber is here</span>}
                  </div>
                  {owners.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1.5 text-[12px]">
                      {owners.map((o) => (
                        <span key={o} className="flex items-center gap-1">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: COLOR_HEX[state.players[o].color] }}
                          />
                          {o === seat ? 'You' : state.players[o].name}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="font-display text-[15px] tracking-wide text-gold">The shore</div>
              )}
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted" data-testid="world-time">
                <Icon name={night ? 'moon' : 'sun'} size={12} />
                {stageName(hour)}
              </div>
            </div>
          </div>

          {/* Top right: mouse look and the character. */}
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              className={`btn !px-3 !py-1 text-[12px] ${diving ? 'btn-primary' : ''}`}
              onClick={diveIn}
              title="Mouse look: move the mouse to turn, click to strike, hold the right button to guard. Esc to leave."
              data-testid="dive-in"
            >
              <Icon name="crosshair" size={14} /> Dive in
            </button>
            <button
              className="btn !px-3 !py-1 text-[12px]"
              onClick={() => {
                if (document.pointerLockElement) document.exitPointerLock();
                openModal('character');
              }}
              title="Design your character"
            >
              <Icon name="user" size={14} /> Character
            </button>
          </div>

          {diving && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-bone/80"
              aria-hidden
            >
              <Icon name="crosshair" size={22} />
            </div>
          )}

          {/* A duel: who you face, and a way out. */}
          {duel && (
            <div
              className="absolute inset-x-0 top-2 mx-auto flex w-fit max-w-[50%] items-center gap-3 rounded-md border border-blood bg-abyss/90 px-3 py-1.5 text-[13px] text-bone shadow-panel"
              role="status"
              data-testid="duel-banner"
            >
              <Icon name="duel" size={16} />
              <span>
                {inDuel && foe !== null ? (
                  <>
                    Duel with <b className="text-ember">{state.players[foe].name}</b>. The game waits until one of
                    you falls.
                  </>
                ) : (
                  <>
                    {state.players[duel.challenger].name} and {state.players[duel.target].name} are duelling.
                  </>
                )}
              </span>
              {inDuel && (
                <button
                  className="btn btn-danger !px-2 !py-0.5 text-[12px]"
                  onClick={() => dispatch({ type: 'YieldDuel', player: seat })}
                >
                  Yield
                </button>
              )}
            </div>
          )}

          {!duel && targetHealth !== null && (
            <div
              className="pointer-events-none absolute left-1/2 top-3 w-40 -translate-x-1/2 rounded-md border border-iron bg-abyss/90 p-2 text-center text-[12px] text-bone"
              data-testid="combat-target"
              aria-live="polite"
            >
              <div className="font-display text-gold">{COMBAT_TEXT.target}</div>
              <meter
                className="mt-1 h-2 w-full accent-gold"
                min={0}
                max={100}
                value={targetHealth}
                aria-label={COMBAT_TEXT.target}
              />
              <div>
                {targetHealth ? `${targetHealth} / 100` : COMBAT_TEXT.reset} · {COMBAT_TEXT.hit} {hitCount}
              </div>
            </div>
          )}

          {/* Bottom left: your health (live fights) and what you carry. */}
          <div
            className="pointer-events-none absolute bottom-3 left-2 rounded-md bg-abyss/80 px-3 py-1.5 text-[12px] text-bone shadow-panel"
            data-testid="my-health"
          >
            {pvp && (
              <div className="flex items-center gap-2">
                <span className="font-display text-gold">Health</span>
                <meter
                  className="h-2 w-28"
                  min={0}
                  max={100}
                  low={30}
                  high={60}
                  optimum={100}
                  value={health}
                  aria-label="Your health"
                />
                <span className="num">{health}</span>
              </div>
            )}
            <div className="text-muted">
              {riding
                ? 'E to dismount'
                : armed
                  ? `Revolver: ${ammo} bullet${ammo === 1 ? '' : 's'} left this game`
                  : 'No weapons yet: search your first settlements for the chest'}
            </div>
          </div>

          <div className="absolute bottom-16 right-2 flex max-w-[95%] flex-wrap justify-end gap-2 rounded-md border border-iron bg-abyss/90 p-2">
            <div className="flex items-center gap-1" role="group" aria-label={COMBAT_TEXT.weapon}>
              {(['sword', 'revolver', 'fist'] as const).map((kind, i) => (
                <button
                  key={kind}
                  className={`btn !px-2 !py-1 text-[12px] ${weapon.weapon === kind ? 'btn-primary' : ''}`}
                  aria-pressed={weapon.weapon === kind}
                  disabled={kind !== 'fist' && !armed}
                  title={kind !== 'fist' && !armed ? 'Find your weapon chest first' : undefined}
                  onClick={() => {
                    worldRef.current?.selectWeapon(kind);
                    refocus();
                  }}
                >
                  {COMBAT_TEXT[kind]}
                  {kind === 'revolver' && armed && <span className="num ml-1 text-[11px] opacity-80">{ammo}</span>}{' '}
                  <kbd>{i + 1}</kbd>
                </button>
              ))}
            </div>
            <button
              className="btn !px-3 !py-1 text-[12px]"
              onClick={() => {
                worldRef.current?.practice();
                refocus();
              }}
            >
              {COMBAT_TEXT.practice}
            </button>
            <button
              className="btn btn-primary !px-3 !py-1 text-[12px]"
              onClick={() => {
                worldRef.current?.attack();
                refocus();
              }}
            >
              {weapon.weapon === 'revolver' ? COMBAT_TEXT.fire : COMBAT_TEXT.attack} <kbd>F</kbd>
            </button>
          </div>

          {needsBoard && !duel && (
            <div className="absolute inset-x-0 top-14 mx-auto w-fit max-w-[50%] rounded-md bg-ember/90 px-3 py-1.5 text-center text-[13px] font-semibold text-abyss shadow-panel">
              Switch to the 2D board to place your pieces
            </div>
          )}

          {showHelp && (
            <div className="pointer-events-none absolute right-2 top-12 w-fit max-w-[46%] rounded-md bg-abyss/75 px-3 py-1.5 text-right text-[12px] text-bone backdrop-blur-sm">
              {touch ? (
                <>
                  Press and drag at the <b className="text-gold">bottom-left</b> to walk ·{' '}
                  <b className="text-gold">drag</b> elsewhere to look
                </>
              ) : (
                COMBAT_TEXT.help
              )}
            </div>
          )}

          {hint && !showHelp && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-14 mx-auto flex w-fit items-center gap-2 rounded-md bg-abyss/80 px-3 py-1.5 text-[13px] text-bone shadow-panel backdrop-blur-sm"
              data-testid="world-hint"
            >
              <kbd className="rounded border border-gold/70 bg-surface-2 px-1.5 font-display text-[12px] text-gold">
                E
              </kbd>
              {hint}
            </div>
          )}

          {notice && (
            <div
              className="pointer-events-none absolute inset-x-0 top-24 mx-auto w-fit max-w-[50%] rounded-md bg-abyss/85 px-3 py-1.5 text-center text-[13px] text-bone shadow-panel"
              role="status"
              data-testid="world-notice"
            >
              {notice}
            </div>
          )}

          {stick && (
            <div className="pointer-events-none absolute" style={{ left: stick.ox - 52, top: stick.oy - 52 }}>
              <div className="h-[104px] w-[104px] rounded-full border-2 border-white/60 bg-white/15" />
              <div
                className="absolute h-11 w-11 rounded-full bg-white/80 shadow-panel"
                style={{ left: 52 - 22 + (stick.x - stick.ox), top: 52 - 22 + (stick.y - stick.oy) }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
