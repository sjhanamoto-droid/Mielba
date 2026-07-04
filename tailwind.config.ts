import type { Config } from "tailwindcss";

// CSS変数トークンを参照するヘルパー（globals.css の :root / :root[data-theme="dark"] で定義）
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
  ],
  // html[data-theme="dark"] でダークモード（layout.tsx のインラインスクリプトが必ずセット）
  darkMode: ["selector", '[data-theme="dark"]'],
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
        // ブランド（信頼感のあるディープブルー。実値は globals.css の CSS変数）
        brand: {
          50: v("brand-50"),
          100: v("brand-100"),
          200: v("brand-200"),
          300: v("brand-300"),
          400: v("brand-400"),
          500: v("brand-500"),
          600: v("brand-600"),
          700: v("brand-700"),
          800: v("brand-800"),
          900: v("brand-900"),
          950: v("brand-950"),
        },
        // アクセント（現場の安全色＝アンバー）
        accent: {
          50: v("accent-50"),
          100: v("accent-100"),
          200: v("accent-200"),
          300: v("accent-300"),
          400: v("accent-400"),
          500: v("accent-500"),
          600: v("accent-600"),
          700: v("accent-700"),
          800: v("accent-800"),
          900: v("accent-900"),
        },
        ink: {
          DEFAULT: v("ink"),
          soft: v("ink-soft"),
          muted: v("ink-muted"),
          faint: v("ink-faint"),
        },
        surface: {
          DEFAULT: v("surface"),
          subtle: v("surface-subtle"),
          sunken: v("surface-sunken"),
        },
        line: {
          DEFAULT: v("line"),
          strong: v("line-strong"),
        },
        // ステータス色
        status: {
          survey: v("status-survey"), // 現調
          active: v("status-active"), // 進行中
          past: v("status-past"), // 過去
          warn: v("status-warn"),
          danger: v("status-danger"),
          info: v("status-info"),
        },
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        // ダークで沈まないよう変数化（globals.css でテーマ別に定義）
        card: "var(--shadow-card)",
        float: "var(--shadow-float)",
        nav: "var(--shadow-nav)",
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
