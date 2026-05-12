/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        cream: '#FAF7F2',
        blush: '#F2C4B0',
        sage: '#A8B5A0',
        charcoal: '#2C2C2C',
      },
      keyframes: {
        'slide-down': {
          '0%': { opacity: '0', transform: 'translate(-50%, -8px)' },
          '100%': { opacity: '1', transform: 'translate(-50%, 0)' },
        },
        'progress-slide': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'slide-down': 'slide-down 0.3s ease-out',
        'progress-slide': 'progress-slide 1.4s ease-in-out infinite',
        'shimmer': 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
}
