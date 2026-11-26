/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        rasp: 'rgb(var(--c-rasp) / <alpha-value>)',
        plum: 'rgb(var(--c-plum) / <alpha-value>)',
        mauve: 'rgb(var(--c-mauve) / <alpha-value>)',
        blush: 'rgb(var(--c-blush) / <alpha-value>)',
        cream: 'rgb(var(--c-cream) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        soft: 'rgb(var(--c-soft) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: { xl2: '1.25rem' },
      boxShadow: {
        soft: '0 2px 12px -2px rgb(var(--c-shadow) / 0.10), 0 1px 3px rgb(var(--c-shadow) / 0.06)',
        lift: '0 10px 30px -8px rgb(var(--c-shadow) / 0.30)',
      },
    },
  },
  plugins: [],
};
