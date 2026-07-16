import path from 'path'
import { defineConfig, ConfigEnv } from 'vite'

const viteConfig = defineConfig(async (configEnv: ConfigEnv) => {
    const { mode } = configEnv
    return {
        // In dev environments, don't clear the terminal after files update
        clearScreen: mode !== 'development',
        // Use an import alias: import from '@/' anywhere instead of 'src/'
        resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
        build: {
            rollupOptions: {
                output: {
                    // Split third-party code out of the main chunk so no
                    // single chunk exceeds Vite's 500 kB warning threshold
                    manualChunks(id: string) {
                        if (!id.includes('node_modules')) {
                            return undefined
                        }
                        // Keep ALL @dhis2 packages in one chunk — they
                        // import each other circularly, and splitting them
                        // breaks module initialisation order at runtime
                        // ("Cannot access X before initialization").
                        if (id.includes('@dhis2')) {
                            return 'vendor-dhis2'
                        }
                        if (
                            id.includes('/react-dom/') ||
                            id.includes('/react/') ||
                            id.includes('/scheduler/')
                        ) {
                            return 'vendor-react'
                        }
                        if (id.includes('i18next') || id.includes('moment')) {
                            return 'vendor-i18n'
                        }
                        return 'vendor'
                    },
                },
            },
        },
    }
})

export default viteConfig
