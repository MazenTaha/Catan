import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MAX_TARGET,
  MIN_TARGET,
  PLAYER_COLORS,
  SIGILS,
  createGame,
  randomSeed,
  type BotLevel,
  type GameState,
  type LayoutMode,
  type PlayerColor,
  type Sigil,
} from '@hexfall/engine';
import {
  activeSeats,
  clampSettings,
  createLobby,
  defaultSettings,
  fillWithBots,
  lobbyToConfig,
  normalizeCode,
  openSeats,
  remoteCount,
  setSeat,
  startProblem,
  type ClientMsg,
  type Lobby,
  type LobbySettings,
  type Seat,
} from '@hexfall/net';
import { Icon } from '../../art/icons/Icon';
import { SigilGlyph } from '../../art/pieces/Sigil';
import { audio } from '../../audio/engine';
import { BOT_BLURB, BOT_NAME, COLOR_HEX, COLOR_NAME, LAYOUT_NAME, SIGIL_NAME } from '../../lexicon';
import { useNet } from '../../state/net';
import { loadProfile, type PlayerProfile } from '../../state/persistence';
import { updateProfile } from '../../state/profile';
import { useStore } from '../../state/store';
import { BoardView } from '../board/Board';
import { Stepper } from '../ui/primitives';
import { blazon } from '../../ui/hall/Arms';
import { Banner, BannerPole } from '../../ui/hall/Banner';
import { Seg } from '../../ui/hall/Controls';
import { ChartSheet, CompassRose, HallBackground, HallLoader, OakPanel, ParchmentSheet, Torch, WaxSeal } from '../../ui/hall/Surfaces';
import { useViewport } from '../../ui/hall/useViewport';

const BOTS: BotLevel[] = ['wanderer', 'warlord', 'archdemon'];
const ROMAN = ['I', 'II', 'III', 'IV'];
type View = 'choose' | 'host' | 'join';

/** Play: set up your profile, then host a table or join one with a room code. */
export function NewGameScreen() {
  const go = useStore((s) => s.go);
  const [profile, setProfileState] = useState<PlayerProfile>(loadProfile);
  const [view, setView] = useState<View>('choose');
  const setProfile = (p: PlayerProfile) => {
    setProfileState(p);
    updateProfile(p);
  };
  const back = () => {
    if (view === 'choose') go('title');
    else {
      useNet.getState().leave();
      setView('choose');
    }
  };
  const vp = useViewport();

  return (
    <HallBackground
      className="relative overflow-x-hidden"
      decor={vp.w >= 1100 && <Torch x={10} y={150} height={130} />}
    >
      <main className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-5 px-4 pb-8 pt-5 sm:px-8">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <button className="hc-plaque" onClick={back} aria-label={view === 'choose' ? 'Back to menu' : 'Back'}>
            <Icon name="arrow" className="rotate-180" size={16} /> {view === 'choose' ? 'The hall' : 'Back'}
          </button>
          <h1 className="hc-title hc-title-gold" style={{ fontSize: vp.w < 640 ? 40 : 62 }}>
            {view === 'choose' ? 'Play' : view === 'host' ? 'Muster the Table' : 'Join a game'}
          </h1>
          {view === 'host' && (
            <div className="ml-auto flex gap-3">
              <span className="hc-btn hc-btn--sm" aria-current="page">
                Host a game
              </span>
              <button className="hc-btn hc-btn--dark hc-btn--sm" onClick={back}>
                Join a game
              </button>
            </div>
          )}
        </header>
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'choose' && (
              <Choose
                profile={profile}
                onProfile={setProfile}
                onHost={() => setView('host')}
                onJoin={(code) => {
                  useNet.getState().join(code, profile);
                  setView('join');
                }}
              />
            )}
            {view === 'host' && <HostLobby profile={profile} />}
            {view === 'join' && <JoinLobby onBack={back} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </HallBackground>
  );
}

// ------------------------------------------------------------------ choose

function Choose({
  profile,
  onProfile,
  onHost,
  onJoin,
}: {
  profile: PlayerProfile;
  onProfile: (p: PlayerProfile) => void;
  onHost: () => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  const valid = /^[A-Z]+-\d{2}$/.test(normalizeCode(code));
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <OakPanel title="Your profile" aria-label="Your profile">
        <div className="flex flex-wrap items-start gap-6 p-5">
          {/* the player's arms on a banner, live as they change */}
          <div className="mx-auto pt-2" aria-hidden>
            <BannerPole gap={0} overhang={30} brackets={false}>
              <Banner width={150} height={250} tincture={{ player: profile.color }} arms={{ color: profile.color, sigil: profile.sigil }} label={profile.name || 'Player'} labelSize={18} gloss={blazon(profile.color, profile.sigil)} />
            </BannerPole>
          </div>
          <ProfileEditor profile={profile} onChange={onProfile} />
        </div>
        <p className="hc-gloss hc-ink-muted px-5 pb-4 !text-[15px]">Saved on this device and used whenever you host or join.</p>
      </OakPanel>

      <div className="flex flex-col gap-7">
        <button
          className="hc-parchment group flex items-center gap-5 px-6 py-6 text-left transition-transform hover:-translate-y-0.5"
          onClick={() => {
            audio.unlock();
            onHost();
          }}
          data-testid="host"
        >
          <WaxSeal size={64} />
          <span className="min-w-0 flex-1">
            <span className="hc-title block text-[36px] text-[color:var(--rubric-dark)]">Host a game</span>
            <span className="mt-1 block text-[18px]">Choose the board and rules, share a room code with friends, and fill empty seats with bots.</span>
          </span>
          <Icon name="arrow" size={22} className="transition-transform group-hover:translate-x-1" />
        </button>

        <form
          className="hc-letter flex flex-col gap-4 px-6 py-6"
          style={{ transform: 'rotate(-0.6deg)' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) {
              audio.unlock();
              onJoin(normalizeCode(code));
            }
          }}
        >
          <div>
            <span className="hc-title block text-[36px] text-[color:var(--rubric-dark)]">Join a game</span>
            <span className="block text-[18px]">Enter the room code your host shared.</span>
          </div>
          <div className="flex gap-3">
            <input
              className="hc-input min-w-0 flex-1 !text-[26px] uppercase tracking-[0.16em]"
              placeholder="DUSK-42"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label="Room code"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
              data-testid="join-code"
            />
            <button className="hc-btn" type="submit" disabled={!valid} data-testid="join">
              Join
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileEditor({ profile, onChange }: { profile: PlayerProfile; onChange: (p: PlayerProfile) => void }) {
  return (
    <div className="flex min-w-[240px] flex-1 flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="hc-label text-[16px] hc-ink-muted">Name</span>
        <input
          className="hc-input w-full"
          value={profile.name}
          maxLength={16}
          onChange={(e) => onChange({ ...profile, name: e.target.value })}
          onBlur={() => !profile.name.trim() && onChange({ ...profile, name: 'Player' })}
          aria-label="Your name"
          data-testid="profile-name"
        />
      </label>
      <div>
        <div className="hc-label mb-1.5 text-[16px] hc-ink-muted">Colour</div>
        <div className="flex gap-2" role="radiogroup" aria-label="Your colour">
          {PLAYER_COLORS.map((c: PlayerColor) => (
            <button
              key={c}
              role="radio"
              aria-checked={profile.color === c}
              aria-label={COLOR_NAME[c]}
              title={COLOR_NAME[c]}
              className="grid h-11 w-11 place-items-center"
              onClick={() => onChange({ ...profile, color: c })}
            >
              <span
                className="block h-8 w-8 rounded-full"
                style={{
                  background: COLOR_HEX[c],
                  border: '1.5px solid var(--ink)',
                  boxShadow: profile.color === c ? '0 0 0 3px var(--paper-card), 0 0 0 5px var(--rubric)' : 'inset 0 -3px 0 rgba(0,0,0,0.25)',
                }}
              />
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="hc-label mb-1.5 text-[16px] hc-ink-muted">Sigil</div>
        <div className="hc-seg" role="radiogroup" aria-label="Your sigil">
          {SIGILS.map((g: Sigil) => (
            <button key={g} type="button" role="radio" aria-checked={profile.sigil === g} aria-label={SIGIL_NAME[g]} title={SIGIL_NAME[g]} className="!px-3" onClick={() => onChange({ ...profile, sigil: g })}>
              <SigilGlyph sigil={g} size={20} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ host

/** Changes the host can make, applied locally when there is no server. */
function applyLocal(l: Lobby, msg: ClientMsg): Lobby {
  if (msg.t === 'settings') return { ...l, settings: clampSettings({ ...l.settings, ...msg.settings }) };
  if (msg.t === 'seat') return setSeat(l, msg.index, msg.choice);
  if (msg.t === 'fill-bots') return fillWithBots(l);
  return l;
}

/** Seat banner sizes for the window width (four seats share the pole). */
function seatSize(w: number): { bw: number; bh: number; gap: number } {
  if (w < 640) return { bw: 140, bh: 250, gap: 18 };
  if (w < 1360) return { bw: 168, bh: 270, gap: 18 };
  return { bw: 196, bh: 290, gap: 24 };
}

function HostLobby({ profile }: { profile: PlayerProfile }) {
  const net = useNet();
  const startGame = useStore((s) => s.startGame);
  const [local, setLocal] = useState<Lobby>(() => createLobby('', profile, 'me', defaultSettings(randomSeed())));
  const opened = useRef(false);
  const vp = useViewport();

  // Open a room on the server; if there is none, play on this device.
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    useNet.getState().host(profile, local.settings);
  }, [profile, local.settings]);
  useEffect(() => {
    if (net.status === 'offline') setLocal((l) => fillWithBots(l));
  }, [net.status]);

  const serverLobby = net.isHost ? net.lobby : null;
  const lobby = serverLobby ?? local;
  const live = !!serverLobby && net.status === 'online';
  // While the room is opening, wait: changes made now would be replaced by the server's lobby.
  const connecting = net.status === 'connecting';
  const editable = !connecting && (live || !serverLobby);
  const apply = (msg: ClientMsg) => {
    if (serverLobby) {
      if (live) net.send(msg);
    } else setLocal((l) => applyLocal(l, msg));
  };
  const settings = lobby.settings;
  const setSettings = (patch: Partial<LobbySettings>) => apply({ t: 'settings', settings: patch });
  const problem = startProblem(lobby);

  const start = () => {
    audio.unlock();
    if (remoteCount(lobby) === 0) {
      // Nobody joined from another device: play right here (saved, undo, pass-and-play).
      if (net.code) useNet.getState().leave();
      startGame(lobbyToConfig(lobby));
    } else net.send({ t: 'start' });
  };
  const seats = activeSeats(lobby);
  const firstOpen = seats.findIndex((s) => s.kind === 'open');
  const size = seatSize(vp.w);
  const pairsOnPhone = vp.w < 640;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-6">
        <section aria-label="Seats" className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <h2 className="hc-label text-[20px] text-[color:var(--gold-light)]">Seats</h2>
            <Seg
              label="Players"
              value={settings.players}
              onChange={(n) => setSettings({ players: n })}
              disabled={!editable}
              small
              options={[
                { v: 3, l: '3 players' },
                { v: 4, l: '4 players' },
              ]}
            />
          </div>
          <div className={`flex flex-col items-center gap-6 pt-7 ${pairsOnPhone ? '' : 'xl:items-start'}`}>
            {(pairsOnPhone ? [seats.slice(0, 2), seats.slice(2)] : [seats]).map((row, ri) => (
              <BannerPole key={ri} gap={size.gap} overhang={36} align="flex-start">
                {row.map((s, j) => {
                  const i = ri * 2 + j;
                  return (
                    <div key={i} className="flex flex-col items-center gap-3" style={{ width: size.bw }}>
                      <SeatBanner seat={s} index={i} lit={i === firstOpen} w={size.bw} h={size.bh} />
                      <SeatControls
                        seat={s}
                        index={i}
                        editable={editable && i > 0}
                        canKick={editable}
                        onChoose={(choice) => apply({ t: 'seat', index: i, choice })}
                        onKick={() => net.send({ t: 'kick', index: i })}
                      />
                    </div>
                  );
                })}
              </BannerPole>
            ))}
          </div>
        </section>

        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <InviteCard status={net.status} code={serverLobby ? lobby.code : null} />
          <div className="flex flex-col gap-3">
            {problem && (
              <p className="hc-oak flex items-center gap-3 !px-4 !py-3 text-[17px] text-[color:var(--on-dark)]" role="status">
                <Icon name="question" size={20} /> {problem}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              {openSeats(lobby) > 0 && (
                <button className="hc-btn hc-btn--dark" onClick={() => apply({ t: 'fill-bots' })} disabled={!editable} data-testid="fill-bots">
                  <Icon name="bot" size={18} /> Fill empty seats with bots
                </button>
              )}
              <button className="hc-btn !min-h-[56px] !px-8 !text-[24px]" disabled={!!problem || connecting || (!!serverLobby && !live)} onClick={start} data-testid="begin">
                Start game
              </button>
            </div>
          </div>
        </div>
      </div>

      <OakPanel title="Articles of the Game" aria-label="The board" className="self-start">
        <div className="flex flex-col gap-1 p-5 text-[18px]">
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span>Victory at</span>
            <Stepper value={settings.targetVp} onChange={(v) => editable && setSettings({ targetVp: v })} min={MIN_TARGET} max={MAX_TARGET} label="Target victory points" />
          </div>
          <hr className="hc-dots" />
          <div className="flex flex-wrap items-center justify-between gap-3 py-1.5">
            <span>First player</span>
            <Seg
              label="First player"
              value={settings.rollOff}
              onChange={(v) => setSettings({ rollOff: v })}
              disabled={!editable}
              small
              options={[
                { v: true, l: 'Dice roll-off' },
                { v: false, l: 'Seat 1' },
              ]}
            />
          </div>
          <hr className="hc-dots" />
          <div className="hc-label mt-1 text-[17px]">The board</div>
          <Seg
            label="Board layout"
            value={settings.layout}
            onChange={(l) => setSettings({ layout: l })}
            disabled={!editable}
            small
            className="w-full [&>button]:flex-1"
            options={(Object.keys(LAYOUT_NAME) as LayoutMode[]).map((l) => ({ v: l, l: LAYOUT_NAME[l] }))}
          />
          <div className="hc-label mt-3 text-[17px]">Seed</div>
          <div className="flex items-center gap-2">
            <input className="hc-input min-w-0 flex-1 italic" value={settings.seed} onChange={(e) => setSettings({ seed: e.target.value })} aria-label="Seed" data-testid="seed" disabled={!editable} />
            <button className="hc-paper-btn !w-[44px] !px-0" onClick={() => setSettings({ seed: randomSeed() })} aria-label="Randomize seed" title="New random board" disabled={!editable}>
              <Icon name="refresh" size={18} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <div className="w-1/2 shrink-0 p-1" style={{ border: '1.5px solid var(--map-ink)', background: 'var(--paper-card)' }}>
              <BoardPreview settings={settings} />
            </div>
            <p className="hc-gloss hc-ink-muted !text-[15px]">Same seed, same board — share it to play this map again.</p>
          </div>
        </div>
      </OakPanel>
    </div>
  );
}

/** A seat's banner: kicker, arms (or a dashed empty shield), name on the ribbon, status as gloss. */
function SeatBanner({ seat, index, lit, w, h, you = false, read = false }: { seat: Seat; index: number; lit: boolean; w: number; h: number; you?: boolean; read?: boolean }) {
  const profile = seat.kind === 'open' ? null : seat.profile;
  let status = '';
  let tone: 'ok' | 'warn' = 'ok';
  if (seat.kind === 'host') status = read ? 'Host' : 'You · host';
  else if (seat.kind === 'remote') {
    status = seat.connected ? (read ? 'Joined' : 'Joined online') : 'Reconnecting…';
    tone = seat.connected ? 'ok' : 'warn';
  } else if (seat.kind === 'bot') status = read ? `Bot · ${BOT_NAME[seat.bot]}` : `Bot · ${BOT_BLURB[seat.bot]}`;
  else if (seat.kind === 'local') status = read ? 'On the host’s device' : 'Plays on this device';
  else {
    status = read ? 'Waiting for a player' : 'Waiting for a player… share the room code';
    tone = 'warn';
  }
  if (you) status = `(you) · ${status}`;
  return (
    <Banner
      width={w}
      height={h}
      tincture={profile ? { player: profile.color } : 'sable'}
      arms={profile ? { color: profile.color, sigil: profile.sigil } : 'empty'}
      kicker={`Seat ${ROMAN[index]}`}
      label={profile ? profile.name : read ? 'Open seat' : 'Empty seat'}
      labelSize={w >= 190 ? 20 : 17}
      gloss={status}
      glossTone={tone}
      lit={lit}
      extra={
        seat.kind === 'host' ? (
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[color:var(--gold-light)]" style={{ top: -30, filter: 'drop-shadow(0 2px 2px #000)' }} aria-hidden>
            <Icon name="crown" size={30} strokeWidth={2} />
          </span>
        ) : undefined
      }
    />
  );
}

/** Under each banner: Invite / Bot / This device, bot difficulty, a local name, or Remove. */
function SeatControls({
  seat,
  index,
  editable,
  canKick,
  onChoose,
  onKick,
}: {
  seat: Seat;
  index: number;
  editable: boolean;
  canKick: boolean;
  onChoose: (c: { kind: 'open' } | { kind: 'bot'; bot: BotLevel } | { kind: 'local'; name?: string }) => void;
  onKick?: () => void;
}) {
  const person = seat.kind === 'host' || seat.kind === 'remote';
  if (seat.kind === 'host') return null;
  return (
    <OakPanel as="div" className="w-[calc(100%+20px)] !p-2" insetClassName="flex flex-col gap-2 p-2">
      {!person && (
        <>
          <Seg
            label={`Seat ${index + 1}`}
            value={seat.kind}
            onChange={(k) => onChoose(k === 'bot' ? { kind: 'bot', bot: seat.kind === 'bot' ? seat.bot : 'warlord' } : k === 'local' ? { kind: 'local' } : { kind: 'open' })}
            disabled={!editable}
            small
            className="w-full [&>button]:flex-1 [&>button]:!px-1 [&>button]:!text-[14px]"
            options={[
              { v: 'open', l: 'Invite', testId: `seat-open-${index}` },
              { v: 'bot', l: 'Bot', testId: `seat-bot-${index}` },
              { v: 'local', l: 'This device', testId: `seat-human-${index}` },
            ]}
          />
          {seat.kind === 'bot' && (
            <select className="hc-select !min-h-[38px] w-full !text-[16px]" value={seat.bot} onChange={(e) => onChoose({ kind: 'bot', bot: e.target.value as BotLevel })} aria-label={`Seat ${index + 1} bot difficulty`} disabled={!editable}>
              {BOTS.map((b) => (
                <option key={b} value={b}>
                  {BOT_NAME[b]}
                </option>
              ))}
            </select>
          )}
          {seat.kind === 'local' && editable && (
            <input className="hc-input !min-h-[38px] w-full !text-[16px]" defaultValue={seat.profile.name} maxLength={16} onBlur={(e) => onChoose({ kind: 'local', name: e.target.value })} aria-label={`Seat ${index + 1} name`} />
          )}
        </>
      )}
      {seat.kind === 'remote' && onKick && canKick && (
        <button className="hc-paper-btn hc-paper-btn--danger hc-paper-btn--sm w-full" onClick={onKick}>
          Remove
        </button>
      )}
    </OakPanel>
  );
}

/** A letter of summons with the room code; also "Opening a room…" and the offline note. */
function InviteCard({ status, code }: { status: string; code: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard refused: the code is on screen to read out */
    }
  };
  let body: ReactNode;
  if (code && (status === 'online' || status === 'reconnecting')) {
    body = (
      <>
        <div className="hc-label text-[15px] hc-rubric">A letter of summons</div>
        <p className="italic">
          Friends choose <b>Join a game</b> and type this code. They take the open seats as they arrive.
        </p>
        <div className="hc-title select-all whitespace-nowrap py-1 leading-none text-[color:var(--ink)]" style={{ fontSize: 'clamp(30px, 8vw, 54px)' }} data-testid="room-code">
          {code}
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="hc-paper-btn" onClick={copy}>
            <Icon name={copied ? 'check' : 'scroll'} size={16} /> {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>
      </>
    );
  } else if (status === 'connecting') {
    body = (
      <>
        <div className="hc-label text-[15px] hc-rubric">A letter of summons</div>
        <p className="flex items-center gap-3 italic">
          <span className="h-3 w-3 rounded-full anim-pulse" style={{ background: 'var(--rubric)' }} aria-hidden /> Opening a room…
        </p>
      </>
    );
  } else {
    body = (
      <>
        <div className="hc-label text-[18px] hc-rubric">Playing on this device</div>
        <p className="italic">The game server isn’t reachable, so friends can’t join right now. You can still play against bots and with friends sharing this device.</p>
      </>
    );
  }
  return (
    <section className="hc-letter relative flex max-w-[460px] flex-col gap-2 px-6 py-5 pr-16 text-[17px]" style={{ transform: 'rotate(-1.5deg)' }} aria-label="Invite">
      <span className="absolute -right-3 -top-4" aria-hidden>
        <WaxSeal size={62} />
      </span>
      {body}
    </section>
  );
}

function BoardPreview({ settings }: { settings: LobbySettings }) {
  const preview = useMemo<GameState | null>(() => {
    try {
      return createGame({
        seed: settings.seed.trim() || 'hexfall',
        layout: settings.layout,
        targetVp: 10,
        firstPlayer: 0,
        seats: [0, 1, 2].map((i) => ({
          name: `P${i}`,
          color: PLAYER_COLORS[i],
          sigil: SIGILS[i],
          kind: 'bot' as const,
        })),
      });
    } catch {
      return null;
    }
  }, [settings.seed, settings.layout]);
  return <div className="overflow-hidden">{preview && <BoardView state={preview} canAct={false} decorative />}</div>;
}

// ------------------------------------------------------------------ join

function JoinLobby({ onBack }: { onBack: () => void }) {
  const net = useNet();
  const vp = useViewport();
  const lobby = net.lobby;
  if (!lobby || net.status !== 'online') {
    const failed = net.status === 'idle' || net.status === 'offline';
    return failed ? (
      <ParchmentSheet className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-8 py-8 text-center">
        <WaxSeal size={60} />
        <h2 className="hc-title text-[34px] text-[color:var(--rubric-dark)]">No table found</h2>
        <p className="text-[18px]" data-testid="join-error" aria-live="polite">
          {net.closed ?? net.error ?? 'Couldn’t reach the game server. Check your connection and try again.'}
        </p>
        <button className="hc-paper-btn" onClick={onBack}>
          Try another code
        </button>
      </ParchmentSheet>
    ) : (
      <div className="h-48" aria-live="polite">
        <HallLoader>Finding the table…</HallLoader>
      </div>
    );
  }
  const host = lobby.seats[0];
  const seats = activeSeats(lobby);
  const size = seatSize(vp.w);
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex flex-wrap items-center gap-5" aria-live="polite">
          <div className="hc-letter px-5 py-3" style={{ transform: 'rotate(-1deg)' }}>
            <div className="hc-label text-[14px] hc-rubric">Room</div>
            <div className="hc-title text-[44px] leading-none">{lobby.code}</div>
          </div>
          <div className="hc-slip" data-testid="join-waiting">
            <span className="inline-flex gap-1" aria-hidden>
              {[0, 1, 2].map((k) => (
                <span key={k} className="h-1.5 w-1.5 rounded-full anim-pulse" style={{ background: 'var(--rubric)', animationDelay: `${k * 0.2}s` }} />
              ))}
            </span>
            You’re in. Waiting for {host.kind === 'open' ? 'the host' : host.profile.name} to start the game.
          </div>
        </section>
        <section aria-label="Seats" className="flex flex-col items-center gap-2">
          <h2 className="hc-label text-[20px] text-[color:var(--gold-light)]">At the table</h2>
          <div className="flex flex-col items-center gap-6 pt-10">
            {(vp.w < 640 ? [seats.slice(0, 2), seats.slice(2)] : [seats]).map((row, ri) => (
              <BannerPole key={ri} gap={size.gap} overhang={36}>
                {row.map((s, j) => (
                  <SeatBanner key={j} seat={s} index={ri * 2 + j} lit={false} w={size.bw} h={size.bh} read you={(s.kind === 'remote' || s.kind === 'host') && s.client === net.client} />
                ))}
              </BannerPole>
            ))}
          </div>
        </section>
      </div>
      <section aria-label="The board">
        <ChartSheet pad={28}>
          <h2 className="hc-label text-center text-[20px]">· The board ·</h2>
          <ul className="mt-2 text-[18px] [&>li+li]:border-t-[1.5px] [&>li+li]:border-dotted [&>li+li]:border-[color:var(--map-ink-muted)] [&>li]:py-1">
            <li>{LAYOUT_NAME[lobby.settings.layout]}</li>
            <li>{lobby.settings.players} players</li>
            <li>First to {lobby.settings.targetVp}</li>
            <li>{lobby.settings.rollOff ? 'Dice roll-off' : 'Host starts'}</li>
          </ul>
          <div className="mt-3 p-1" style={{ border: '1.5px solid var(--map-ink)', background: 'var(--paper-card)' }}>
            <BoardPreview settings={lobby.settings} />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <button className="hc-paper-btn" onClick={onBack}>
              Leave table
            </button>
            <CompassRose size={84} />
          </div>
        </ChartSheet>
      </section>
    </div>
  );
}
