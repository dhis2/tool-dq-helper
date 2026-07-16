import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

/*
 * When the app runs in the DHIS2 Global Shell, react-router@6+ no longer
 * fires "popstate" events on pushState/replaceState. The Global Shell
 * listens for "popstate" to keep the browser URL in sync, so we dispatch
 * it manually on every route change.
 */
export const SyncUrlWithGlobalShell = () => {
    const location = useLocation()

    useEffect(() => {
        dispatchEvent(new PopStateEvent('popstate'))
    }, [location.key])

    return <Outlet />
}
