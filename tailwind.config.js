/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7ff',
          100: '#ebf0fe',
          200: '#ced9fd',
          300: '#a1b6fb',
          400: '#6d8bf7',
          500: '#435ef1',
          600: '#2c3ee5',
          700: '#232ebf',
          800: '#21299b',
          900: '#1f267c',
          950: '#121649',
        },
        // Canonical severity scale. The codebase expresses criticality with
        // ad-hoc rose/amber/emerald (and stray yellow/violet); these named
        // tokens are the one source of truth for new/aligned UI so a
        // critical finding never looks like a footer note.
        severity: {
          critical: '#e11d48', // rose-600
          high: '#f43f5e', // rose-500
          medium: '#f59e0b', // amber-500
          low: '#10b981', // emerald-500
          info: '#0ea5e9', // sky-500
        },
        // Removed the unused `neon` cyberpunk palette (cyan/pink/purple/green) —
        // 0 references, a generic-AI tell carried in config dead weight.
      },
      fontFamily: {
        // Distinctive, domain-fit type system (replaced generic Inter/Poppins/
        // Space Grotesk). Bricolage Grotesque = characterful display, Hanken
        // Grotesk = clean readable body, JetBrains Mono = forensic IOC/terminal.
        sans: ['"Hanken Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"Hanken Grotesk"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(37, 99, 235, 0.25), 0 18px 60px rgba(37, 99, 235, 0.15)',
        // Removed unused glow-cyan/pink/purple (0 references; neon-AI tell).
      },
      animation: {
        'float-enhanced': 'float-enhanced 6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        'scroll-horizontal': 'scroll-horizontal 40s linear infinite',
        'count-up': 'count-up 0.8s ease-out forwards',
        'threat-pulse': 'threat-pulse 4s ease-in-out infinite',
      },
      keyframes: {
        'float-enhanced': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg) scale(1)' },
          '33%': { transform: 'translateY(-20px) rotate(2deg) scale(1.05)' },
          '66%': { transform: 'translateY(-10px) rotate(-2deg) scale(0.95)' },
        },
        'pulse-glow': {
          '0%, 100%': {
            opacity: '1',
            boxShadow: '0 0 20px rgba(44, 62, 229, 0.4)',
          },
          '50%': {
            opacity: '0.7',
            boxShadow: '0 0 36px rgba(44, 62, 229, 0.6), 0 0 60px rgba(67, 94, 241, 0.3)',
          },
        },
        'scroll-horizontal': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'count-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'threat-pulse': {
          '0%, 100%': { opacity: '0.1', transform: 'scale(1)' },
          '50%': { opacity: '0.3', transform: 'scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
};
