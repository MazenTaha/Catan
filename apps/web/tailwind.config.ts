import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: { md2: '900px' },
      colors: {
        abyss: v('abyss'),
        surface: { 1: v('surface-1'), 2: v('surface-2'), raised: v('raised') },
        iron: v('iron'),
        tarnish: v('tarnish'),
        gold: v('gold'),
        ember: v('ember'),
        blood: v('blood'),
        bone: v('bone'),
        muted: v('muted'),
        frost: v('frost'),
        venom: v('venom'),
        p: {
          crimson: v('p-crimson'),
          frost: v('p-frost'),
          bone: v('p-bone'),
          violet: v('p-violet'),
        },
      },
      fontFamily: {
        display: ['Cinzel', 'serif'],
        logo: ['"Cinzel Decorative"', 'Cinzel', 'serif'],
        body: ['"Crimson Pro"', 'Georgia', 'serif'],
      },
      fontSize: {
        base: ['16px', '1.45'],
      },
      boxShadow: {
        panel: 'inset 0 0 40px rgb(0 0 0 / 0.55), 0 10px 30px rgb(0 0 0 / 0.5)',
        glow: '0 0 18px rgb(var(--gold) / 0.45)',
      },
      transitionDuration: { fast: '160ms' },
    },
  },
  plugins: [],
} satisfies Config;
