import { BoneDie } from '../../ui/hall/Controls';

/** A bone die face (Hall & Chart). */
export function DieFace({ value, size = 52, red = false }: { value: number; size?: number; red?: boolean }) {
  return <BoneDie value={value} size={size} red={red} />;
}
