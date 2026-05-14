/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Brand palette — unchanged
        cream: '#FAF7F2',
        blush: {
          DEFAULT: '#F2C4B0',
          light: '#F9E4D8',
          dark: '#E8A088',
        },
        sage: {
          DEFAULT: '#A8B5A0',
          light: '#C8D4C0',
          dark: '#7A8E72',
        },
        charcoal: {
          DEFAULT: '#2C2C2C',
          light: '#4A4A4A',
          muted: '#6B6B6B',
        },
        // Semantic surface tokens
        surface: {
          DEFAULT: '#FFFFFF',
          raised: '#FDFCFB',
          overlay: '#F5F2ED',
        },
        // Semantic status tokens
        success: {
          DEFAULT: '#4CAF82',
          bg: '#F0FAF5',
          text: '#2D7A56',
        },
        warning: {
          DEFAULT: '#F0A030',
          bg: '#FFF8EC',
          text: '#8A5A00',
        },
        danger: {
          DEFAULT: '#E05555',
          bg: '#FEF2F2',
          text: '#B91C1C',
        },
        info: {
          DEFAULT: '#5B8DEF',
          bg: '#EFF5FF',
          text: '#1E4DB7',
        },
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(44,44,44,0.04)',
        DEFAULT: '0 1px 3px 0 rgba(44,44,44,0.07), 0 1px 2px -1px rgba(44,44,44,0.05)',
        md: '0 4px 6px -1px rgba(44,44,44,0.07), 0 2px 4px -2px rgba(44,44,44,0.05)',
        lg: '0 10px 15px -3px rgba(44,44,44,0.08), 0 4px 6px -4px rgba(44,44,44,0.04)',
        xl: '0 20px 25px -5px rgba(44,44,44,0.08), 0 8px 10px -6px rgba(44,44,44,0.04)',
        inner: 'inset 0 2px 4px 0 rgba(44,44,44,0.06)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(100%) scale(0.9)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'progress-slide': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite linear',
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        'slide-up': 'slide-up 0.2s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
        'toast-in': 'toast-in 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        'progress-slide': 'progress-slide 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
