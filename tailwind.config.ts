import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Hiragino Sans",
          "Hiragino Kaku Gothic ProN",
          "Noto Sans JP",
          "Meiryo",
          "sans-serif",
        ],
      },
      colors: {
        // ブランド（信頼感のあるディープブルー）
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd3ff",
          300: "#8eb6ff",
          400: "#598dff",
          500: "#2f63f5",
          600: "#1947e8",
          700: "#1436d4",
          800: "#172eac",
          900: "#192d88",
          950: "#141d52",
        },
        // アクセント（現場の安全色＝アンバー）
        accent: {
          50: "#fff8eb",
          100: "#ffedc6",
          200: "#ffd888",
          300: "#ffbe4a",
          400: "#ffa620",
          500: "#f98307",
          600: "#dd6002",
          700: "#b74106",
          800: "#94330c",
          900: "#7a2b0d",
        },
        ink: {
          DEFAULT: "#0f172a",
          soft: "#334155",
          muted: "#64748b",
          faint: "#94a3b8",
        },
        surface: {
          DEFAULT: "#ffffff",
          subtle: "#f7f8fb",
          sunken: "#eef1f6",
        },
        line: {
          DEFAULT: "#e6e9f0",
          strong: "#d4d9e3",
        },
        // ステータス色
        status: {
          survey: "#8b5cf6", // 現調
          active: "#10b981", // 進行中
          past: "#94a3b8", // 過去
          warn: "#f59e0b",
          danger: "#ef4444",
          info: "#3b82f6",
        },
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        float: "0 8px 24px rgba(16,24,40,0.12)",
        nav: "0 -1px 0 rgba(16,24,40,0.06), 0 -8px 24px rgba(16,24,40,0.06)",
      },
      maxWidth: {
        app: "560px",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "slide-up": "slide-up 0.3s cubic-bezier(0.16,1,0.3,1)",
        "scale-in": "scale-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
