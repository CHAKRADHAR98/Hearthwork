/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
        backgroundImage: {
            "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
            "gradient-conic":
            "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
            'rainbow': "linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet)",
            'rainbow-less': "linear-gradient(45deg, red, blue, indigo)",
            'rainbow-less-hover': "linear-gradient(45deg, #ff4d4d, #4d4dff, #4d4dff)",
            'rainbow-less-disabled': "linear-gradient(45deg, darkred, darkblue, darkindigo)",
            'cyber-grid': "radial-gradient(rgba(224, 185, 58, 0.07) 1px, transparent 1px)",
        },
      colors: {
        primary: "#2a2119",
        secondary: "#3a2f24",
        "light-secondary": '#4a3d2f',
        darkblue: "#241c15",
        quaternary: "#e0b93a",
        quaternaryhover: "#ecc95a",
        button: "#2c241b",
        'light-gray': "#5a4a36",
        'cyber-cyan': '#e0b93a',
        'neon-green': '#93c47d',
        'cyber-purple': '#e07a4f',
        'dark-panel': '#1f1913',
        'panel-border': '#5a4a36',
        // Hearthwork village palette
        hearth: {
          night: '#151a2b', dusk: '#2c3e5c', ink: '#1f1913', bark: '#2a2119', soot: '#3a2f24', line: '#5a4a36',
          sand: '#cdb88f', parchment: '#f6ead2', honey: '#e0b93a', gold: '#c9a227', ember: '#ff8a3d',
          moss: '#7fb069', leaf: '#93c47d', berry: '#c96f5b', sky: '#7ec8e3',
        },
      },
      fontFamily: {
        // kept the old name so every existing heading switches to the pixel display font
        'orbitron': ['var(--font-pixel)', 'monospace'],
        'pixel': ['var(--font-pixel)', 'monospace'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2.5s ease-in-out infinite',
        'scan': 'scan 8s linear infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px #e0b93a40, 0 0 20px #e0b93a20' },
          '50%': { boxShadow: '0 0 15px #e0b93a80, 0 0 40px #ff8a3d40' },
        },
        'scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
