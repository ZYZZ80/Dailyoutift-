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
    },
  },
  plugins: [],
}
