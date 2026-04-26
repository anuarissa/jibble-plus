/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Paleta custom (no usar tailwind blue/indigo default)
        bg: {
          900: '#0a0a0c',
          800: '#111114',
          700: '#1a1a1f',
          600: '#22222a',
          500: '#2c2c36',
        },
        ink: {
          50: '#fafafa',
          100: '#e5e5ea',
          200: '#a1a1aa',
          300: '#6b6b73',
          400: '#4a4a52',
        },
        accent: {
          // Naranja terracotta (no genérico)
          DEFAULT: '#ff6b35',
          50: '#fff4ee',
          100: '#ffe4d3',
          400: '#ff8a5e',
          500: '#ff6b35',
          600: '#e8541d',
          700: '#b33d10',
        },
        good: '#22c55e',
        warn: '#f59e0b',
        bad: '#ef4444',
        idle: '#52525b',
      },
      boxShadow: {
        // Sombras tinted, no flat
        soft: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -8px rgba(0,0,0,0.5)',
        glow: '0 0 0 1px rgba(255,107,53,0.15), 0 8px 32px -4px rgba(255,107,53,0.25)',
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px -12px rgba(0,0,0,0.6)',
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
