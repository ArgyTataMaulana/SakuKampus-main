// SakuKampus UMY - Tailwind Config (Bauhaus Modernist UI Theme)
// Geometric constructivist aesthetics: Primary Red, Ultramarine Blue, Chrome Yellow, Bold Ink & Canvas Cream

tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#EEF2FF', // Soft ice cobalt
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#93C5FD',
          400: '#3B82F6',
          500: '#1040C0', // Bauhaus Ultramarine Blue
          600: '#1040C0', // Bauhaus Primary Blue
          700: '#0C3299', // Deep Cobalt
          800: '#08236B',
          900: '#051642',
          950: '#020B21'
        },
        bauhaus: {
          red: '#D02020',      // Bauhaus Primary Red
          blue: '#1040C0',     // Bauhaus Primary Blue
          yellow: '#F0C020',   // Bauhaus Primary Yellow
          dark: '#121212',     // Bauhaus Deep Ink
          cream: '#F4F1EA',    // Bauhaus Architectural Warm Canvas
          white: '#FFFFFF',
          gray: '#E2DFD7'
        },
        sky: {
          DEFAULT: '#1040C0',
          light: '#EEF2FF',
          soft: '#C7D2FE',
          dark: '#0C3299'
        },
        sand: {
          DEFAULT: '#F4F1EA', // Warm canvas cream
          dark: '#121212'
        },
        cream: {
          DEFAULT: '#F4F1EA'  // Architectural paper
        },
        ink: {
          DEFAULT: '#121212', // Bauhaus pure ink
          light: '#333333'
        },
        konbini: {
          DEFAULT: '#F0C020', // Bauhaus yellow accent
          light: '#FDE047'
        },
        // Dark mode palette - Deep constructivist charcoal & neon yellow/blue accents
        nightbg:    { DEFAULT: '#121212', card: '#1C1C22', card2: '#26262E' },
        nighttext:  { DEFAULT: '#F4F1EA' },
        nightaccent:{ DEFAULT: '#F0C020' },
        // Semantic financial colors
        income:  { DEFAULT: '#059669', light: '#34D399' },
        expense: { DEFAULT: '#D02020', light: '#F87171' }
      },
      fontFamily: {
        display: ['"Outfit"', 'system-ui', 'sans-serif'],
        pixel:   ['"Outfit"', 'system-ui', 'sans-serif'],
        label:   ['"Outfit"', 'system-ui', 'sans-serif'],
        sans:    ['"Outfit"', 'system-ui', 'sans-serif'],
        body:    ['"Outfit"', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        'card': '0px',      // Pure Bauhaus sharp right-angle blocks
        'card-lg': '0px',
        'pill': '9999px',   // Pure Bauhaus geometric circle/pill
        'btn': '0px',       // Sharp functional buttons
        'btn-pill': '9999px'
      },
      boxShadow: {
        'card': '4px 4px 0px 0px #121212',
        'card-hover': '6px 6px 0px 0px #121212',
        'card-dark': '4px 4px 0px 0px #F0C020',
        'card-dark-hover': '6px 6px 0px 0px #F0C020',
        'btn': '3px 3px 0px 0px #121212',
        'btn-active': '1px 1px 0px 0px #121212',
        'btn-danger': '3px 3px 0px 0px #121212',
        'pressed': 'inset 2px 2px 0px rgba(0, 0, 0, 0.4)',
        'float': '6px 6px 0px 0px #121212',
        'hard': '4px 4px 0px 0px #121212',
        'hard-red': '4px 4px 0px 0px #D02020',
        'hard-blue': '4px 4px 0px 0px #1040C0',
        'hard-yellow': '4px 4px 0px 0px #F0C020'
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)'
      }
    }
  }
};
