// tailwind.config.ts
import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                primary: { DEFAULT: "#0A73B7", hover: "#085F97" },
                accent: "#FF8A00",
                surface: "#FFFFFF",
                bg: "#F8FAFC",
                border: "#E5E7EB",
            },
        },
    },
    plugins: [forms()],
} satisfies Config
