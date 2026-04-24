export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./pages/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./routes/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        volt: {
          // Navy-forward dark UI (pairs with sidebar art + MetLife blues) with soft violet depth.
          bg0: "#0b0e1b",
          bg1: "#0a1224",
          panel: "#0c162e",
          card: "#101f3d",
          card2: "#14264a",
          border: "#243a72",
          borderSoft: "#1a3058",
          text: "#f1f5ff",
          muted: "#b8c4e4",
          muted2: "#94a3c8",
          accent: "#7c9eff",
          accent2: "#38bdf8",
          good: "#34d399",
          warn: "#fbbf24",
          bad: "#fb7185",
        },
      },
      boxShadow: {
        "volt-card": "0 18px 50px rgba(2, 8, 23, 0.65)",
      },
    },
  },
  plugins: [],
};