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
          // Deep purple base + elevated surfaces (matches provided reference UI).
          bg0: "#07041a",
          bg1: "#0b0623",
          panel: "#0f0a2c",
          card: "#140c3a",
          card2: "#191048",
          border: "#2a1b5a",
          borderSoft: "#21124d",
          text: "#eef0ff",
          muted: "#a6a6c8",
          muted2: "#7f7fa6",
          accent: "#7c5cff",
          accent2: "#35a7ff",
          good: "#22c55e",
          warn: "#f59e0b",
          bad: "#fb7185",
        },
      },
      boxShadow: {
        "volt-card": "0 18px 45px rgba(8, 3, 28, 0.55)",
      },
    },
  },
  plugins: [],
};