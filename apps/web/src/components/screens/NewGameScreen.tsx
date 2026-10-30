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
import { Icon, type IconName } from '../../art/icons/Icon';
import { PlayerDisc, SigilGlyph } from '../../art/pieces/Sigil';
import { audio } from '../../audio/engine';
import { BOT_BLURB, BOT_NAME, COLOR_HEX, COLOR_NAME, LAYOUT_NAME, SIGIL_NAME } from '../../lexicon';
import { useNet } from '../../state/net';
import { loadProfile, type PlayerProfile } from '../../state/persistence';
import { updateProfile } from '../../state/profile';
import { useStore } from '../../state/store';
import { BoardView } from '../board/Board';
import { NAME_COLOR } from '../panels/LogLineView';
import { Tooltip } from '../ui/primitives';

const BOTS: BotLevel[] = ['wanderer', 'warlord', 'archdemon'];
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

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-3">
        <button
          className="icon-btn"
          onClick={back}
          aria-label={view === 'choose' ? 'Back to menu' : 'Back'}
        >
          <Icon name="arrow" className="rotate-180" />
        </button>
        <h1 className="font-display text-[24px] uppercase tracking-[0.18em] text-gold">
          {view === 'choose' ? 'Play' : view === 'host' ? 'Host a game' : 'Join a game'}
        </h1>
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section className="panel px-5 py-4" aria-label="Your profile">
        <h2 className="panel-title mb-3">Your profile</h2>
        <ProfileEditor profile={profile} onChange={onProfile} />
        <p className="mt-3 text-[13px] text-muted">
          Saved on this device and used whenever you host or join.
        </p>
      </section>

      <div className="flex flex-col gap-4">
        <button
          className="panel tile-interactive group flex items-center gap-4 px-5 py-5 text-left transition-transform"
          onClick={() => {
            audio.unlock();
            onHost();
          }}
          data-testid="host"
        >
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl cream-fill">
            <Icon name="flag" size={26} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[18px] uppercase tracking-[0.12em] text-gold">
              Host a game
            </span>
            <span className="block text-[15px] text-muted">
              Choose the board and rules, share a room code with friends, and fill empty seats with
              bots.
            </span>
          </span>
          <Icon
            name="arrow"
            size={18}
            className="text-muted transition-transform group-hover:translate-x-1"
          />
        </button>

        <form
          className="panel flex flex-col gap-3 px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) {
              audio.unlock();
              onJoin(normalizeCode(code));
            }
          }}
        >
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-frost/15 text-frost shadow-[inset_0_0_0_1px_rgb(var(--frost)/0.35)]">
              <Icon name="user" size={26} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[18px] uppercase tracking-[0.12em] text-bone">
                Join a game
              </span>
              <span className="block text-[15px] text-muted">
                Enter the room code your host shared.
              </span>
            </span>
          </div>
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-xl border border-iron bg-surface-1 px-4 py-2.5 font-display text-[18px] uppercase tracking-[0.18em] text-bone placeholder:text-muted/60 focus:border-gold/70"
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
            <button
              className="btn btn-primary !px-5"
              type="submit"
              disabled={!valid}
              data-testid="join"
            >
              Join
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileEditor({
  profile,
  onChange,
}: {
  profile: PlayerProfile;
  onChange: (p: PlayerProfile) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <PlayerDisc color={profile.color} sigil={profile.sigil} size={64} active />
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-display text-[10px] uppercase tracking-[0.16em] text-muted">
            Name
          </span>
          <input
            className="w-full rounded-xl border border-iron bg-surface-1 px-3 py-2 text-[17px] text-bone focus:border-gold/70"
            value={profile.name}
            maxLength={16}
            onChange={(e) => onChange({ ...profile, name: e.target.value })}
            onBlur={() => !profile.name.trim() && onChange({ ...profile, name: 'Player' })}
            aria-label="Your name"
            data-testid="profile-name"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <div className="mb-1.5 font-display text-[10px] uppercase tracking-[0.16em] text-muted">
            Colour
          </div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Your colour">
            {PLAYER_COLORS.map((c: PlayerColor) => (
              <button
                key={c}
                role="radio"
                aria-checked={profile.color === c}
                aria-label={COLOR_NAME[c]}
                title={COLOR_NAME[c]}
                className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                  profile.color === c
                    ? 'scale-110 border-bone shadow-[0_0_14px_rgba(255,255,255,0.35)]'
                    : 'border-transparent'
                }`}
                style={{ background: COLOR_HEX[c] }}
                onClick={() => onChange({ ...profile, color: c })}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 font-display text-[10px] uppercase tracking-[0.16em] text-muted">
            Sigil
          </div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Your sigil">
            {SIGILS.map((g: Sigil) => (
              <button
                key={g}
                role="radio"
                aria-checked={profile.sigil === g}
                aria-label={SIGIL_NAME[g]}
                title={SIGIL_NAME[g]}
                className={`grid h-9 w-9 place-items-center rounded-xl border transition-colors ${
                  profile.sigil === g
                    ? 'border-gold bg-gold/15 text-gold'
                    : 'border-iron text-muted hover:text-bone'
                }`}
                onClick={() => onChange({ ...profile, sigil: g })}
              >
                <SigilGlyph sigil={g} size={17} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ host

/** Changes the host can make, applied locally when there is no server. */
function applyLocal(l: Lobby, msg: ClientMsg): Lobby {
  if (msg.t === 'settings') return { ...l, settings: clampSettings(msg.settings) };
  if (msg.t === 'seat') return setSeat(l, msg.index, msg.choice);
  if (msg.t === 'fill-bots') return fillWithBots(l);
  return l;
}

function HostLobby({ profile }: { profile: PlayerProfile }) {
  const net = useNet();
  const startGame = useStore((s) => s.startGame);
  const [local, setLocal] = useState<Lobby>(() =>
    createLobby('', profile, 'me', defaultSettings(randomSeed())),
  );
  const opened = useRef(false);

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
  const setSettings = (patch: Partial<LobbySettings>) =>
    apply({ t: 'settings', settings: { ...settings, ...patch } });
  const problem = startProblem(lobby);

  const start = () => {
    audio.unlock();
    if (remoteCount(lobby) === 0) {
      // Nobody joined from another device: play right here (saved, undo, pass-and-play).
      if (net.code) useNet.getState().leave();
      startGame(lobbyToConfig(lobby));
    } else net.send({ t: 'start' });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-4">
        <InviteCard status={net.status} code={serverLobby ? lobby.code : null} />

        <section className="panel px-4 py-4 sm:px-5" aria-label="Seats">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="panel-title flex-1">Seats</h2>
            {([3, 4] as const).map((n) => (
              <button
                key={n}
                className={`chip !py-1 ${settings.players === n ? 'border-gold bg-gold/15 text-gold' : 'text-muted'}`}
                onClick={() => setSettings({ players: n })}
                aria-pressed={settings.players === n}
                disabled={!editable}
              >
                {n} players
              </button>
            ))}
          </div>
          <ul className="flex flex-col gap-2">
            {activeSeats(lobby).map((s, i) => (
              <SeatRow
                key={i}
                seat={s}
                index={i}
                editable={editable && i > 0}
                onChoose={(choice) => apply({ t: 'seat', index: i, choice })}
                onKick={() => net.send({ t: 'kick', index: i })}
              />
            ))}
          </ul>
          {openSeats(lobby) > 0 && (
            <button
              className="btn mt-3 w-full !py-2 text-[12px]"
              onClick={() => apply({ t: 'fill-bots' })}
              disabled={!editable}
              data-testid="fill-bots"
            >
              <Icon name="bot" size={15} /> Fill empty seats with bots
            </button>
          )}

          <h2 className="panel-title mb-2 mt-5">Rules</h2>
          <label className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-[15px]">Victory at</span>
            <input
              type="range"
              min={MIN_TARGET}
              max={MAX_TARGET}
              value={settings.targetVp}
              onChange={(e) => setSettings({ targetVp: Number(e.target.value) })}
              className="min-w-0 flex-1 accent-[#f2ac52]"
              aria-label="Target victory points"
              disabled={!editable}
            />
            <span className="num w-10 text-right text-[20px] text-gold">{settings.targetVp}</span>
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="w-28 shrink-0 text-[15px]">First player</span>
            <button
              className={`chip !py-1 ${settings.rollOff ? 'border-gold bg-gold/15 text-gold' : 'text-muted'}`}
              onClick={() => setSettings({ rollOff: true })}
              disabled={!editable}
            >
              Dice roll-off
            </button>
            <button
              className={`chip !py-1 ${!settings.rollOff ? 'border-gold bg-gold/15 text-gold' : 'text-muted'}`}
              onClick={() => setSettings({ rollOff: false })}
              disabled={!editable}
            >
              Seat 1
            </button>
          </div>
        </section>
      </div>

      <section className="panel flex flex-col gap-3 px-4 py-4 sm:px-5" aria-label="The board">
        <h2 className="panel-title">The board</h2>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LAYOUT_NAME) as LayoutMode[]).map((l) => (
            <button
              key={l}
              className={`chip !py-1 ${settings.layout === l ? 'border-gold bg-gold/15 text-gold' : 'text-muted'}`}
              onClick={() => setSettings({ layout: l })}
              aria-pressed={settings.layout === l}
              disabled={!editable}
            >
              {LAYOUT_NAME[l]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            className="min-w-0 flex-1 rounded-xl border border-iron bg-surface-1 px-3 py-1.5 font-mono text-[14px] text-bone"
            value={settings.seed}
            onChange={(e) => setSettings({ seed: e.target.value })}
            aria-label="Seed"
            data-testid="seed"
            disabled={!editable}
          />
          <Tooltip label="New random board" align="end">
            <button
              className="icon-btn"
              onClick={() => setSettings({ seed: randomSeed() })}
              aria-label="Randomize seed"
              disabled={!editable}
            >
              <Icon name="refresh" />
            </button>
          </Tooltip>
        </div>
        <p className="-mt-1 text-[13px] text-muted">
          Same seed, same board — share it to play this map again.
        </p>
        <BoardPreview settings={settings} />
        <div className="mt-auto flex flex-col gap-2">
          {problem && <p className="text-center text-[14px] text-muted">{problem}</p>}
          <button
            className="btn btn-primary w-full !py-2.5 text-[13px]"
            disabled={!!problem || connecting || (!!serverLobby && !live)}
            onClick={start}
            data-testid="begin"
          >
            <Icon name="flag" /> Start game
          </button>
        </div>
      </section>
    </div>
  );
}

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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="font-display text-[10px] uppercase tracking-[0.2em] text-muted">
            Room code
          </div>
          <div
            className="num select-all text-[34px] leading-tight tracking-[0.12em] text-gold"
            data-testid="room-code"
            style={{ textShadow: '0 0 22px rgb(var(--gold) / 0.45)' }}
          >
            {code}
          </div>
        </div>
        <button className="btn !px-3" onClick={copy}>
          <Icon name={copied ? 'check' : 'scroll'} size={15} /> {copied ? 'Copied' : 'Copy code'}
        </button>
        <p className="w-full text-[14px] text-muted sm:w-auto sm:flex-1">
          Friends choose <b className="text-bone">Join a game</b> and type this code. They take the
          open seats as they arrive.
        </p>
      </div>
    );
  } else if (status === 'connecting') {
    body = (
      <div className="flex items-center gap-3 text-muted">
        <span className="h-3 w-3 rounded-full bg-gold anim-pulse" aria-hidden /> Opening a room…
      </div>
    );
  } else {
    body = (
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/30 text-muted">
          <Icon name="user" size={18} />
        </span>
        <div className="text-[14px]">
          <div className="font-display text-[12px] uppercase tracking-[0.14em] text-bone">
            Playing on this device
          </div>
          <p className="text-muted">
            The game server isn’t reachable, so friends can’t join right now. You can still play
            against bots and with friends sharing this device.
          </p>
        </div>
      </div>
    );
  }
  return (
    <section className="panel px-4 py-4 sm:px-5" aria-label="Invite">
      {body}
    </section>
  );
}

function SeatRow({
  seat,
  index,
  editable,
  onChoose,
  onKick,
}: {
  seat: Seat;
  index: number;
  editable: boolean;
  onChoose: (
    c: { kind: 'open' } | { kind: 'bot'; bot: BotLevel } | { kind: 'local'; name?: string },
  ) => void;
  onKick?: () => void;
}) {
  const person = seat.kind === 'host' || seat.kind === 'remote';
  const profile = seat.kind === 'open' ? null : seat.profile;
  const choice = (
    kind: 'open' | 'bot' | 'local',
    label: string,
    icon: IconName,
    testid: string,
  ) => (
    <button
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-display text-[11px] uppercase tracking-[0.08em] transition-colors ${
        seat.kind === kind
          ? 'bg-gold text-[#2a1406] shadow-[0_4px_12px_-6px_rgb(255_140_60/0.9)]'
          : 'text-muted hover:bg-surface-2 hover:text-bone'
      }`}
      onClick={() =>
        onChoose(
          kind === 'bot'
            ? { kind: 'bot', bot: seat.kind === 'bot' ? seat.bot : 'warlord' }
            : kind === 'local'
              ? { kind: 'local' }
              : { kind: 'open' },
        )
      }
      aria-pressed={seat.kind === kind}
      disabled={!editable}
      data-testid={testid}
    >
      <Icon name={icon} size={13} /> {label}
    </button>
  );
  return (
    <li
      className={`tile flex flex-wrap items-center gap-3 px-3 py-2.5 ${seat.kind === 'host' ? 'tile-selected' : ''}`}
    >
      {profile ? (
        <PlayerDisc color={profile.color} sigil={profile.sigil} size={36} />
      ) : (
        <span
          className="grid h-9 w-9 place-items-center rounded-full border-2 border-dashed border-iron text-muted anim-pulse"
          aria-hidden
        >
          <Icon name="user" size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {seat.kind === 'local' && editable ? (
          <input
            className="w-full max-w-[180px] rounded-lg border border-iron bg-surface-1 px-2 py-1 text-[15px] text-bone"
            defaultValue={seat.profile.name}
            maxLength={16}
            onBlur={(e) => onChoose({ kind: 'local', name: e.target.value })}
            aria-label={`Seat ${index + 1} name`}
          />
        ) : (
          <div
            className="truncate font-display text-[14px] tracking-[0.04em]"
            style={{ color: profile ? NAME_COLOR[profile.color] : undefined }}
          >
            {profile ? profile.name : <span className="text-muted">Waiting for a player…</span>}
          </div>
        )}
        <div className="mt-0.5 text-[12px] text-muted">
          {seat.kind === 'host' && 'You · host'}
          {seat.kind === 'remote' && (seat.connected ? 'Joined online' : 'Reconnecting…')}
          {seat.kind === 'bot' && `Bot · ${BOT_BLURB[seat.bot]}`}
          {seat.kind === 'local' && 'Plays on this device'}
          {seat.kind === 'open' && 'Share the room code to fill this seat'}
        </div>
      </div>
      {!person && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            className="flex rounded-xl border border-iron/70 bg-black/25 p-0.5"
            role="group"
            aria-label={`Seat ${index + 1}`}
          >
            {choice('open', 'Invite', 'user', `seat-open-${index}`)}
            {choice('bot', 'Bot', 'bot', `seat-bot-${index}`)}
            {choice('local', 'This device', 'eye', `seat-human-${index}`)}
          </div>
          {seat.kind === 'bot' && (
            <select
              className="rounded-lg border border-iron bg-surface-1 px-2 py-1.5 text-[14px] text-bone"
              value={seat.bot}
              onChange={(e) => onChoose({ kind: 'bot', bot: e.target.value as BotLevel })}
              aria-label={`Seat ${index + 1} bot difficulty`}
              disabled={!editable}
            >
              {BOTS.map((b) => (
                <option key={b} value={b}>
                  {BOT_NAME[b]}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {seat.kind === 'remote' && onKick && editable && (
        <button
          className="chip !py-1 text-muted hover:!border-ember hover:!text-ember"
          onClick={onKick}
        >
          Remove
        </button>
      )}
    </li>
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
  return (
    <div className="overflow-hidden rounded-2xl">
      {preview && <BoardView state={preview} canAct={false} decorative />}
    </div>
  );
}

// ------------------------------------------------------------------ join

function JoinLobby({ onBack }: { onBack: () => void }) {
  const net = useNet();
  const lobby = net.lobby;
  if (!lobby || net.status !== 'online') {
    const failed = net.status === 'idle' || net.status === 'offline';
    return (
      <section
        className="panel mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-6 py-8 text-center"
        aria-live="polite"
      >
        {failed ? (
          <>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ember/15 text-ember">
              <Icon name="close" size={22} />
            </span>
            <p className="text-[16px] text-bone" data-testid="join-error">
              {net.closed ??
                net.error ??
                'Couldn’t reach the game server. Check your connection and try again.'}
            </p>
            <button className="btn" onClick={onBack}>
              Try another code
            </button>
          </>
        ) : (
          <>
            <span className="h-4 w-4 rounded-full bg-gold anim-pulse" aria-hidden />
            <p className="text-muted">Finding the table…</p>
          </>
        )}
      </section>
    );
  }
  const host = lobby.seats[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="panel flex flex-wrap items-center gap-4 px-5 py-4" aria-live="polite">
          <div>
            <div className="font-display text-[10px] uppercase tracking-[0.2em] text-muted">
              Room
            </div>
            <div className="num text-[28px] leading-tight tracking-[0.12em] text-gold">
              {lobby.code}
            </div>
          </div>
          <div
            className="flex w-full min-w-0 items-center gap-2 text-[15px] text-bone sm:w-auto sm:flex-1"
            data-testid="join-waiting"
          >
            <span className="inline-flex gap-1" aria-hidden>
              {[0, 1, 2].map((k) => (
                <span
                  key={k}
                  className="h-1.5 w-1.5 rounded-full bg-gold anim-pulse"
                  style={{ animationDelay: `${k * 0.2}s` }}
                />
              ))}
            </span>
            You’re in. Waiting for {host.kind === 'open' ? 'the host' : host.profile.name} to start
            the game.
          </div>
        </section>
        <section className="panel px-5 py-4" aria-label="Seats">
          <h2 className="panel-title mb-3">At the table</h2>
          <ul className="flex flex-col gap-2">
            {activeSeats(lobby).map((s, i) => (
              <JoinSeat
                key={i}
                seat={s}
                you={(s.kind === 'remote' || s.kind === 'host') && s.client === net.client}
              />
            ))}
          </ul>
        </section>
      </div>
      <section className="panel flex flex-col gap-3 px-5 py-4" aria-label="The board">
        <h2 className="panel-title">The board</h2>
        <div className="flex flex-wrap gap-1.5 text-[13px]">
          <span className="chip text-bone">{LAYOUT_NAME[lobby.settings.layout]}</span>
          <span className="chip text-bone">{lobby.settings.players} players</span>
          <span className="chip text-bone">First to {lobby.settings.targetVp}</span>
          <span className="chip text-bone">
            {lobby.settings.rollOff ? 'Dice roll-off' : 'Host starts'}
          </span>
        </div>
        <BoardPreview settings={lobby.settings} />
        <button className="btn mt-auto w-full" onClick={onBack}>
          Leave table
        </button>
      </section>
    </div>
  );
}

function JoinSeat({ seat, you }: { seat: Seat; you: boolean }) {
  const profile = seat.kind === 'open' ? null : seat.profile;
  return (
    <li className={`tile flex items-center gap-3 px-3 py-2.5 ${you ? 'tile-selected' : ''}`}>
      {profile ? (
        <PlayerDisc color={profile.color} sigil={profile.sigil} size={34} />
      ) : (
        <span
          className="grid h-[34px] w-[34px] place-items-center rounded-full border-2 border-dashed border-iron text-muted"
          aria-hidden
        >
          <Icon name="user" size={15} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div
          className="truncate font-display text-[14px]"
          style={{ color: profile ? NAME_COLOR[profile.color] : undefined }}
        >
          {profile ? profile.name : <span className="text-muted">Open seat</span>}
          {you && <span className="ml-2 text-[11px] text-muted">(you)</span>}
        </div>
        <div className="text-[12px] text-muted">
          {seat.kind === 'host' && 'Host'}
          {seat.kind === 'remote' && (seat.connected ? 'Joined' : 'Reconnecting…')}
          {seat.kind === 'bot' && `Bot · ${BOT_NAME[seat.bot]}`}
          {seat.kind === 'local' && 'On the host’s device'}
          {seat.kind === 'open' && 'Waiting for a player'}
        </div>
      </div>
    </li>
  );
}
