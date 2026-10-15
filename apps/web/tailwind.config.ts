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
        panel: '0 1px 0 rgb(0 0 0 / 0.3), 0 16px 36px -12px rgb(0 0 0 / 0.7)',
        glow: '0 0 0 1px rgb(var(--gold) / 0.45), 0 0 22px -4px rgb(var(--gold) / 0.6)',
      },
      transitionDuration: { fast: '160ms' },
    },
  },
  plugins: [],
} satisfies Config;
