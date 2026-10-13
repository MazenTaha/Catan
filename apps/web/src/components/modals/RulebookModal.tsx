import { COSTS, type CostKey } from '@hexfall/engine';
import { Icon, type IconName } from '../../art/icons/Icon';
import { HARBOR_NAME, HOST, LONGEST, OMEN_NAME, OMEN_TEXT, PIECE_NAME, RESOURCE_NAME, TERRAIN_NAME } from '../../lexicon';
import { useStore } from '../../state/store';
import { CountsInline, Modal } from '../ui/primitives';

function Section({ title, icon, children }: { title: string; icon: IconName; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 flex items-center gap-2 font-display text-[14px] uppercase tracking-[0.16em] text-gold">
        <Icon name={icon} size={18} /> {title}
      </h3>
      <div className="flex flex-col gap-1.5 text-[15px] leading-relaxed text-bone/90">{children}</div>
    </section>
  );
}

const ROWS: { key: CostKey; icon: IconName; note: string }[] = [
  { key: 'causeway', icon: 'causeway', note: 'Must connect to your roads or buildings. 15 per player.' },
  { key: 'outpost', icon: 'outpost', note: '1 point. Must touch your road; never next to another settlement (distance rule). 5 per player.' },
  { key: 'citadel', icon: 'citadel', note: '2 points. Replaces one of your settlements; collects 2 resources. 4 per player.' },
  { key: 'omen', icon: 'omen', note: 'Draw a hidden card. Cannot be played the turn you buy it.' },
];

export default function RulebookModal() {
  const close = useStore((s) => s.closeModal);
  return (
    <Modal title="How to Play" icon="rules" onClose={close} wide>
      <Section title="Goal" icon="crown">
        <p>Be the first to reach 10 victory points (or the target you chose) on your own turn.</p>
      </Section>
      <Section title="The board" icon="scroll">
        <p>
          {TERRAIN_NAME.witchwood} → {RESOURCE_NAME.wood}; {TERRAIN_NAME.ashen} → {RESOURCE_NAME.clay}; {TERRAIN_NAME.moors} → {RESOURCE_NAME.wool};{' '}
          {TERRAIN_NAME.fields} → {RESOURCE_NAME.grain}; {TERRAIN_NAME.peaks} → {RESOURCE_NAME.ore}. The {TERRAIN_NAME.waste} produces nothing; the robber starts there.
        </p>
        <p>Dots under each number show its odds: 6 and 8 (red) are rolled most often after 7.</p>
      </Section>
      <Section title="Setup" icon="outpost">
        <p>In turn order each player places a Settlement and a Road touching it; then in reverse order a second pair. Your second Settlement immediately collects one of each adjacent resource.</p>
      </Section>
      <Section title="A turn" icon="hourglass">
        <p>1. Roll the dice. Every hex showing the number gives each adjacent Settlement 1 resource and each City 2 — unless the robber is on it.</p>
        <p>2. Trade and build in any order. 3. End your turn. You may play one development card per turn, even before rolling.</p>
        <p>If the bank cannot pay everyone a resource, a single owed player takes what remains; if several are owed, nobody gets it.</p>
      </Section>
      <Section title="Costs" icon="citadel">
        <table className="w-full text-left text-[14px]">
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key} className="border-b border-iron/40">
                <td className="py-1.5 pr-2">
                  <span className="inline-flex items-center gap-1.5 font-display text-[14px] uppercase tracking-[0.08em]">
                    <Icon name={r.icon} size={16} className="text-gold" /> {PIECE_NAME[r.key]}
                  </span>
                </td>
                <td className="py-1.5 pr-2">
                  <CountsInline counts={COSTS[r.key]} size={16} />
                </td>
                <td className="py-1.5 text-muted">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Rolling a 7" icon="wraith">
        <p>On a 7 nothing is produced. Everyone holding more than 7 cards discards half (rounded down). Then the roller moves the robber to another hex and steals one random card from a player with a building there.</p>
      </Section>
      <Section title="Trade" icon="trade">
        <p>Only the player whose turn it is may trade. Offer any terms to the others; they may accept, decline or counter.</p>
        <p>
          With the bank: 4:1 always; 3:1 at a {HARBOR_NAME.any}; 2:1 at a matching harbor such as a {HARBOR_NAME.wood}. You need a Settlement or City on the harbor.
        </p>
      </Section>
      <Section title="Development cards (25)" icon="omen">
        {(['warden', 'decree', 'harvest', 'tithe', 'relic'] as const).map((o) => (
          <p key={o}>
            <b className="text-gold">{OMEN_NAME[o]}</b> — {OMEN_TEXT[o]}
          </p>
        ))}
      </Section>
      <Section title="Special cards (2 points each)" icon="sword">
        <p>
          <b className="text-gold">{LONGEST}</b>: an unbroken road of 5+ segments, longer than anyone else's. An opponent's settlement or city on it breaks it. The holder keeps it on ties.
        </p>
        <p>
          <b className="text-gold">{HOST}</b>: 3+ Knights played, more than anyone else. The holder keeps it on ties.
        </p>
      </Section>
      <Section title="Keys" icon="dice">
        <p>Space — roll / end turn · Esc — cancel placement or close · Tab — move between spots, Enter to place.</p>
      </Section>
    </Modal>
  );
}
