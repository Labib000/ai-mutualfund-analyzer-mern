// Root config: only vite-plus lint + format settings (carried over from the Laravel app).
// The client's Vite build config lives in client/vite.config.ts.
import { defineConfig } from 'vite-plus';

export default defineConfig({
    lint: {
        ignorePatterns: [
            '**/node_modules/**',
            '**/dist/**',
            'client/public/**',
            'client/src/components/ui/*',
        ],
        options: {
            denyWarnings: true,
            typeAware: true,
        },
    },
    fmt: {
        printWidth: 80,
        tabWidth: 4,
        singleQuote: true,
        semi: true,
        singleAttributePerLine: false,
        htmlWhitespaceSensitivity: 'css',
        ignorePatterns: [
            '.github/**',
            '**/dist/**',
            'package-lock.json',
            '*.md',
            'client/src/components/ui/*',
        ],
        sortTailwindcss: {
            functions: ['clsx', 'cn', 'cva'],
            stylesheet: 'client/src/app.css',
        },
    },
});
