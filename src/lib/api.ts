// Thin wrapper around the DHIS2 app-runtime data engine giving the rest
// of the app a small imperative API (the tool's flows are long chains of
// dependent requests, which fit imperative code better than declarative
// query components).

export interface QueryParams {
    [key: string]: string | number | boolean | string[] | undefined
}

// Matches the surface of the engine returned by useDataEngine()
export interface DataEngine {
    query: (query: Record<string, unknown>) => Promise<Record<string, unknown>>
    mutate: (mutation: Record<string, unknown>) => Promise<unknown>
}

export interface D2Api {
    get: <T>(resource: string, params?: QueryParams) => Promise<T>
    // POST (metadata imports, dataStore creation). Returns response body.
    post: <T>(
        resource: string,
        data: unknown,
        params?: QueryParams
    ) => Promise<T>
    // PUT (full replace of dataStore keys and metadata groups)
    put: <T>(resource: string, id: string, data: unknown) => Promise<T>
}

// The engine rejects with a FetchError whose `details` is the parsed
// response body (e.g. a metadata import report for 409s).
export interface ApiError extends Error {
    details?: {
        message?: string
        status?: string
        httpStatusCode?: number
        response?: Record<string, unknown>
        typeReports?: unknown[]
    }
    type?: string
}

export const createApi = (engine: DataEngine): D2Api => ({
    get: async <T>(resource: string, params?: QueryParams): Promise<T> => {
        const result = await engine.query({
            data: { resource, params },
        })
        return result.data as T
    },
    post: async <T>(
        resource: string,
        data: unknown,
        params?: QueryParams
    ): Promise<T> => {
        const result = await engine.mutate({
            resource,
            type: 'create',
            data,
            params,
        })
        return result as T
    },
    put: async <T>(resource: string, id: string, data: unknown): Promise<T> => {
        const result = await engine.mutate({
            resource,
            type: 'replace',
            id,
            data,
        })
        return result as T
    },
})

// Extract a readable message from an engine error
export const errorMessage = (error: unknown): string => {
    const err = error as ApiError
    return err?.details?.message || err?.message || String(error)
}

// Extract the DHIS2 status ("ERROR", "CONFLICT", ...) from an engine error
export const errorStatus = (error: unknown): string => {
    const err = error as ApiError
    return err?.details?.status || 'ERROR'
}
