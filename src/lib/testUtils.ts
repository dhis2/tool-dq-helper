// Test helpers: an in-memory D2Api fake that records every call and
// serves responses from a handler you provide per test.
import { D2Api, QueryParams } from './api'

export interface RecordedCall {
    method: 'get' | 'post' | 'put'
    resource: string
    id?: string
    data?: unknown
    params?: QueryParams
}

export interface FakeApi {
    api: D2Api
    calls: RecordedCall[]
    /** All recorded calls matching method + resource */
    find: (method: RecordedCall['method'], resource: string) => RecordedCall[]
}

/**
 * Build a fake D2Api. `onGet` maps (resource, params) to a response;
 * `onPost` may be omitted (defaults to `{ status: 'OK' }`).
 */
export const fakeApi = (handlers: {
    onGet: (resource: string, params?: QueryParams) => unknown
    onPost?: (resource: string, data: unknown, params?: QueryParams) => unknown
}): FakeApi => {
    const calls: RecordedCall[] = []
    const api: D2Api = {
        get: async <T>(resource: string, params?: QueryParams): Promise<T> => {
            calls.push({ method: 'get', resource, params })
            return handlers.onGet(resource, params) as T
        },
        post: async <T>(
            resource: string,
            data: unknown,
            params?: QueryParams
        ): Promise<T> => {
            calls.push({ method: 'post', resource, data, params })
            return (
                handlers.onPost
                    ? handlers.onPost(resource, data, params)
                    : { status: 'OK' }
            ) as T
        },
        put: async <T>(
            resource: string,
            id: string,
            data: unknown
        ): Promise<T> => {
            calls.push({ method: 'put', resource, id, data })
            return { status: 'OK' } as T
        },
    }
    return {
        api,
        calls,
        find: (method, resource) =>
            calls.filter(
                (call) => call.method === method && call.resource === resource
            ),
    }
}

/** Sequential fake UIDs, 11 chars each (DHIS2 UID length). */
export const fakeUids = (count: number): string[] =>
    Array.from(
        { length: count },
        (_, index) => `Uid${String(index).padStart(8, '0')}`
    )
