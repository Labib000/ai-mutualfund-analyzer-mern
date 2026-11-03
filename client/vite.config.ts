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
                        { name: 'vendor', test: /node_modules[\\/]/ },
                    ],
                },
            },
        },
    },
});
