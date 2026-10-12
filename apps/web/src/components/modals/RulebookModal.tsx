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
  { key: 'causeway', icon: 'causeway', note: 'Must connect to your network. 15 in supply.' },
  { key: 'outpost', icon: 'outpost', note: '1 point. Needs your causeway; never next to another outpost. 5 in supply.' },
  { key: 'citadel', icon: 'citadel', note: '2 points. Replaces one of your outposts; yields double. 4 in supply.' },
  { key: 'omen', icon: 'omen', note: 'Draw a hidden Omen card. Cannot be played the turn you buy it.' },
];

export default function RulebookModal() {
  const close = useStore((s) => s.closeModal);
  return (
    <Modal title="The Rule of the Isle" icon="rules" onClose={close} wide>
      <Section title="Goal" icon="crown">
        <p>Be the first to reach the target (default 10 points) — and only on your own turn.</p>
      </Section>
      <Section title="The land" icon="scroll">
        <p>
          {TERRAIN_NAME.witchwood} → {RESOURCE_NAME.wood}; {TERRAIN_NAME.ashen} → {RESOURCE_NAME.clay}; {TERRAIN_NAME.moors} → {RESOURCE_NAME.wool};{' '}
          {TERRAIN_NAME.fields} → {RESOURCE_NAME.grain}; {TERRAIN_NAME.peaks} → {RESOURCE_NAME.ore}. {TERRAIN_NAME.waste} yields nothing and begins haunted by the Wraith.
        </p>
        <p>Dots under each number show its odds: 6 and 8 (blood-red) are the most likely after 7.</p>
      </Section>
      <Section title="Founding" icon="outpost">
        <p>In turn order each player places an Outpost and a Causeway touching it; then in reverse order a second pair. Your second Outpost immediately yields one of each adjacent resource.</p>
      </Section>
      <Section title="A turn" icon="hourglass">
        <p>1. Roll the dice. Every hex showing the number pays each adjacent Outpost 1 card and each Citadel 2 — unless the Wraith stands on it.</p>
        <p>2. Build and trade in any order. 3. End your turn. You may play one Omen per turn, even before rolling.</p>
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
      <Section title="The seven" icon="wraith">
        <p>On a 7 nothing is produced. Everyone holding more than 7 cards discards half (rounded down). Then the roller moves the Wraith to another hex and robs one random card from a player with a holding there.</p>
      </Section>
      <Section title="Trade" icon="trade">
        <p>Only the active player trades. Offer any terms to the others; they may accept, decline or counter.</p>
        <p>
          With the bank: 4:1 always; 3:1 at a {HARBOR_NAME.any}; 2:1 at a matching harbor such as the {HARBOR_NAME.wood}. You need an Outpost or Citadel on the harbor's coast.
        </p>
      </Section>
      <Section title="Omens (25)" icon="omen">
        {(['warden', 'decree', 'harvest', 'tithe', 'relic'] as const).map((o) => (
          <p key={o}>
            <b className="text-gold">{OMEN_NAME[o]}</b> — {OMEN_TEXT[o]}
          </p>
        ))}
      </Section>
      <Section title="Claims (2 points each)" icon="sword">
        <p>
          <b className="text-gold">{LONGEST}</b>: an unbroken trail of 5+ of your causeways, longer than anyone else's. An opponent's holding on the trail breaks it. The holder keeps it on ties.
        </p>
        <p>
          <b className="text-gold">{HOST}</b>: 3+ Wardens played, more than anyone else. The holder keeps it on ties.
        </p>
      </Section>
      <Section title="Keys" icon="dice">
        <p>Space — roll / end turn · Esc — cancel placement or close · Tab — move between spots, Enter to place.</p>
      </Section>
    </Modal>
  );
}
