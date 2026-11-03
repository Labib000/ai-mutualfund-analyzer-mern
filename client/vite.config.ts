import { fileURLToPath } from 'node:url';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        react(),
        babel({
            presets: [reactCompilerPreset()],
        }),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            '/api': 'http://localhost:3000',
            '/internal': 'http://localhost:3000',
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rolldownOptions: {
            output: {
                // Libraries in their own chunks: their hashes stay the same
                // between our deploys, so browsers keep them cached.
                codeSplitting: {
                    groups: [
                        {
                            name: 'react',
                            test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                        },
                        {
                            name: 'router',
                            test: /node_modules[\\/]react-router[\\/]/,
                        },
                        {
                            name: 'motion',
                            test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/,
                        },
                        {
                            name: 'icons',
                            test: /node_modules[\\/]@fortawesome[\\/]/,
                        },
                        {
                            // Shared with Recharts; listed first so it isn't pulled into "charts".
                            name: 'clsx',
                            test: /node_modules[\\/]clsx[\\/]/,
                        },
                        {
                            // Recharts and its own dependencies; only the dashboard loads it.
                            name: 'charts',
                            test: /node_modules[\\/](recharts|victory-vendor|d3-[a-z-]+|internmap|decimal\.js-light|@reduxjs[\\/]toolkit|react-redux|redux|redux-thunk|reselect|immer|es-toolkit|eventemitter3|tiny-invariant)[\\/]/,
                        },
                        { name: 'vendor', test: /node_modules[\\/]/ },
                    ],
                },
            },
        },
    },
});
