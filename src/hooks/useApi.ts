import { useDataEngine } from '@dhis2/app-runtime'
import { useMemo } from 'react'
import { createApi, D2Api, DataEngine } from '@/lib/api'

export const useApi = (): D2Api => {
    const engine = useDataEngine()
    return useMemo(() => createApi(engine as unknown as DataEngine), [engine])
}
