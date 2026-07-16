import { CssReset, CssVariables } from '@dhis2/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import './locales'
import { AppRoutes } from './AppRoutes'
import { InitialiseGate } from '@/components/InitialiseGate'
import { SyncUrlWithGlobalShell } from '@/utils/SyncUrlWithGlobalShell'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Metadata changes rarely mid-session; refetches are explicit
            // (invalidateQueries after imports/deletes)
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
})

const router = createHashRouter([
    {
        element: <SyncUrlWithGlobalShell />,
        children: [
            {
                path: '/*',
                element: (
                    <InitialiseGate>
                        <AppRoutes />
                    </InitialiseGate>
                ),
            },
        ],
    },
])

const App = () => (
    <QueryClientProvider client={queryClient}>
        <CssReset />
        <CssVariables theme spacers colors elevations />
        <RouterProvider router={router} />
    </QueryClientProvider>
)

export default App
