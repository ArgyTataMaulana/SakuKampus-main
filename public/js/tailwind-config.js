// SakuKampus - Tailwind Config (Apple Minimalism + Bento Grid: Monochrome & Emerald)

tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
          950: '#022C22'
        },
        canvas: {
          light: '#F5F5F7',
          dark: '#09090B'
        },
        surface: {
          light: '#FFFFFF',
          subtle: '#F4F4F5',
          dark: '#121215',
          darkSubtle: '#1C1C21'
        },
        ink: {
          DEFAULT: '#09090B',
          secondary: '#52525B',
          muted: '#71717A'
        },
        // Compatibility aliases for existing utility references
        cream: { DEFAULT: '#F5F5F7' },
        nightbg: { DEFAULT: '#09090B', card: '#121215', card2: '#1C1C21' },
        nighttext: { DEFAULT: '#FAFAFA' },
        income: { DEFAULT: '#059669', light: '#34D399' },
        expense: { DEFAULT: '#DC2626', light: '#F87171' }
      },
      fontFamily: {
        display: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        body: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        bento: '20px',
        modal: '24px'
      },
      boxShadow: {
        bento: '0 1px 2px rgba(0, 0, 0, 0.03), 0 6px 20px rgba(0, 0, 0, 0.025)',
        'bento-dark': '0 1px 2px rgba(0, 0, 0, 0.25), 0 8px 24px rgba(0, 0, 0, 0.22)',
        emerald: '0 8px 22px -6px rgba(5, 150, 105, 0.45)',
        float: '0 14px 36px -8px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.08)'
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)'
      }
    }
  }
};
