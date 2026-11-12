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
            'cyber-grid': "linear-gradient(rgba(0, 245, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 245, 255, 0.04) 1px, transparent 1px)",
        },
      colors: {
        primary: "#282D4E",
        secondary: "#323A64",
        "light-secondary": '#545C8E',
        darkblue: "#2a3154",
        quaternary: "#06d6a0",
        quaternaryhover: "#5FE5C2",
        button: "#202540",
        'light-gray': "#464B67",
        'cyber-cyan': '#00F5FF',
        'neon-green': '#14F195',
        'cyber-purple': '#9945FF',
        'dark-panel': '#0A0B0F',
        'panel-border': '#1A2035',
      },
      fontFamily: {
        'orbitron': ['var(--font-orbitron)', 'sans-serif'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2.5s ease-in-out infinite',
        'scan': 'scan 8s linear infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px #00F5FF40, 0 0 20px #00F5FF20' },
          '50%': { boxShadow: '0 0 15px #00F5FF80, 0 0 40px #00F5FF40, 0 0 60px #00F5FF20' },
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
