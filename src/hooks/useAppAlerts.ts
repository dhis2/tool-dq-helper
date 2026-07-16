import { useAlert } from '@dhis2/app-runtime'

type AlertStatus = 'info' | 'success' | 'warning' | 'error'

export interface AppAlerts {
    showInfo: (message: string) => void
    showSuccess: (message: string) => void
    showWarning: (message: string) => void
    showError: (message: string) => void
}

/**
 * App-wide alert helper on top of the platform alerts service.
 * Info/success alerts auto-hide; warnings and errors stay until closed
 * (matching the behaviour of the pre-platform tool).
 */
export const useAppAlerts = (): AppAlerts => {
    const { show } = useAlert(
        ({ message }) => message as string,
        ({ status }) => {
            switch (status as AlertStatus) {
                case 'success':
                    return { success: true, duration: 5000 }
                case 'warning':
                    return { warning: true, permanent: true }
                case 'error':
                    return { critical: true, permanent: true }
                default:
                    return { duration: 5000 }
            }
        }
    )

    return {
        showInfo: (message) => show({ message, status: 'info' }),
        showSuccess: (message) => show({ message, status: 'success' }),
        showWarning: (message) => show({ message, status: 'warning' }),
        showError: (message) => show({ message, status: 'error' }),
    }
}
