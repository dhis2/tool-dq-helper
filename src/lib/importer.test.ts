import { runImport } from './importer'
import { fakeApi, FakeApi } from './testUtils'
import { BaseConfig, PendingImport } from './types'

const baseConfig: BaseConfig = {
    userGroup: 'UserGrp0001',
    dataElementGroup: 'DeGrp000001',
    indicatorGroup: 'InGrp000001',
    predictorGroup: 'PdGrp000001',
    predictorGroupThreshold: 'PdGrpThr001',
    predictorGroupAnalysis: 'PdGrpAna001',
    predictorGroupConsistency: 'PdGrpCon001',
}

const THRESHOLD_PD = 'ThrPd000001'
const ANALYSIS_PD = 'AnaPd000001'

const makePending = (): PendingImport => ({
    outlier: {
        metadata: {
            dataElements: [{ id: 'OutDe000001', name: 'de' }],
            predictors: [
                { id: THRESHOLD_PD, name: 'threshold pd' },
                { id: ANALYSIS_PD, name: 'analysis pd' },
            ],
            indicators: [{ id: 'OutIn000001', name: 'in' }],
        },
        config: {
            '§NAME§': 'Foo',
            '§DE_SOURCE§': 'SrcDe000001',
            '§PD_THRESHOLD§': THRESHOLD_PD,
        },
    },
    consistency: {
        metadata: {
            dataElements: [{ id: 'ConDe000001', name: 'de' }],
            predictors: [{ id: 'ConPd000001', name: 'pd' }],
            indicators: [{ id: 'ConIn000001', name: 'in' }],
        },
        config: { '§NAME§': 'Foo', '§DE_SOURCE§': 'SrcDe000001' },
    },
    completeness: {
        metadata: {
            indicators: [{ id: 'ComIn000001', name: 'in' }],
        },
        config: { '§NAME§': 'Foo', '§DE_SOURCE§': 'SrcDe000001' },
    },
    conflicts: new Set(),
})

const makeApi = (options?: { failFirstMetadataPost?: boolean }): FakeApi => {
    let metadataPosts = 0
    return fakeApi({
        onGet: (resource) => {
            if (resource.startsWith('dataStore/dqConfig/')) {
                return []
            }
            if (resource.startsWith('dataElementGroups/')) {
                return { name: 'group', dataElements: [] }
            }
            if (resource.startsWith('indicatorGroups/')) {
                return { name: 'group', indicators: [] }
            }
            if (resource.startsWith('predictorGroups/')) {
                return { name: 'group', predictors: [] }
            }
            throw new Error(`Unexpected GET ${resource}`)
        },
        onPost: (resource) => {
            if (resource === 'metadata') {
                metadataPosts += 1
                if (metadataPosts === 1 && options?.failFirstMetadataPost) {
                    throw Object.assign(new Error('conflict'), {
                        details: { status: 'ERROR' },
                    })
                }
            }
            return { status: 'OK' }
        },
    })
}

describe('runImport', () => {
    it('reports every step as successful on a clean import', async () => {
        const fake = makeApi()
        const results = await runImport(fake.api, makePending(), baseConfig)

        expect(results.every((row) => row.success)).toBe(true)
        // 7 outlier + 6 consistency + 3 completeness steps
        expect(results).toHaveLength(16)
    })

    it('splits outlier predictors between threshold and analysis groups', async () => {
        const fake = makeApi()
        await runImport(fake.api, makePending(), baseConfig)

        const thresholdPut = fake
            .find('put', 'predictorGroups')
            .find((call) => call.id === baseConfig.predictorGroupThreshold)
        const analysisPut = fake
            .find('put', 'predictorGroups')
            .find((call) => call.id === baseConfig.predictorGroupAnalysis)

        expect(
            (thresholdPut?.data as { predictors: { id: string }[] }).predictors
        ).toEqual([{ id: THRESHOLD_PD }])
        expect(
            (analysisPut?.data as { predictors: { id: string }[] }).predictors
        ).toEqual([{ id: ANALYSIS_PD }])
    })

    it('appends each config to its dataStore array keyed by DE_SOURCE', async () => {
        const fake = makeApi()
        await runImport(fake.api, makePending(), baseConfig)

        const storeKeys = fake
            .find('put', 'dataStore/dqConfig')
            .map((call) => call.id)
        expect(storeKeys).toEqual(['outliers', 'consistency', 'completeness'])

        const outlierPut = fake
            .find('put', 'dataStore/dqConfig')
            .find((call) => call.id === 'outliers')
        const entries = outlierPut?.data as Record<string, unknown>[]
        expect(Object.keys(entries[0])).toEqual(['SrcDe000001'])
    })

    it('skips group and dataStore steps for a check whose import failed', async () => {
        const fake = makeApi({ failFirstMetadataPost: true })
        const results = await runImport(fake.api, makePending(), baseConfig)

        // Outlier check collapses to a single failed row...
        const outlierRows = results.filter((row) =>
            row.label.startsWith('Outlier')
        )
        expect(outlierRows).toHaveLength(1)
        expect(outlierRows[0].success).toBe(false)
        // ...and its dataStore array was never touched
        const storeKeys = fake
            .find('put', 'dataStore/dqConfig')
            .map((call) => call.id)
        expect(storeKeys).toEqual(['consistency', 'completeness'])
        // while the other checks completed normally
        expect(
            results
                .filter((row) => !row.label.startsWith('Outlier'))
                .every((row) => row.success)
        ).toBe(true)
    })
})
