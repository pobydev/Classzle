import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
        include: ['tests/**/*.test.ts'],
        // 휴대용 SSD에서는 처음 불러오는 데 오래 걸릴 수 있습니다.
        testTimeout: 180000,
    },
});
