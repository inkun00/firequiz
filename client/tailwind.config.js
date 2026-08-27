/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fire: {
          50: '#fff1f0',
          100: '#ffdfdc',
          200: '#ffc5c0',
          300: '#ff9d94',
          400: '#f86455',
          500: '#eb3825',
          600: '#d92210',
          700: '#b71809',
          800: '#97170c',
          900: '#7d1910',
        },
        safety: {
          yellow: '#FFD600',
          orange: '#FF6D00',
          blue: '#00B0FF',
          green: '#00E676',
        }
      },
      animation: {
        'bounce-short': 'bounce 0.5s ease-in-out 2',
        'pulse-fast': 'pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 8s linear infinite',
      }
    },
  },
  plugins: [],
}
