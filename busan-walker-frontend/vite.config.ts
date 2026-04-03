import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ["react", "react-dom", "react-router-dom"],
                    query: ["@tanstack/react-query"],
                    forms: ["react-hook-form", "@hookform/resolvers", "zod"],
                    ui: ["sonner", "lucide-react"],
                },
            },
        },
    },
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:8080",
                changeOrigin: true,
                secure: false,
            },
            "/uploads": {
                target: "http://localhost:8080",
                changeOrigin: true,
                secure: false,
            },
        },
    },
})
