import { QueryParams } from './api'
import { buildPendingImport, PreviewRequest } from './configure'
import { fakeApi, fakeUids, FakeApi } from './testUtils'

const DE_ID = 'SrcDe000001'
const DS_ID = 'SrcDs000001'
const USER_GROUP = 'UserGrp0001'

const baseRequest: PreviewRequest = {
    deSourceId: DE_ID,
    dataSetId: DS_ID,
    ouLevelId: 'OuLevel0001',
    threshold: '3.5',
    completenessApproach: 'standard',
    userGroupId: USER_GROUP,
}

/** Fake serving everything buildPendingImport needs; no existing conflicts. */
const makeApi = (overrides?: {
    deName?: string
    deShortName?: string
    existingNames?: string[]
}): FakeApi =>
    fakeApi({
        onGet: (resource: string, params?: QueryParams) => {
            if (resource === 'system/id') {
                return { codes: fakeUids(Number(params?.limit) || 1) }
            }
            if (resource === `dataElements/${DE_ID}`) {
                return {
                    id: DE_ID,
                    name: overrides?.deName || 'Measles new',
                    shortName: overrides?.deShortName || 'Measles new',
                }
            }
            if (resource === 'dataElementOperands') {
                return {
                    dataElementOperands: [
                        {
                            id: `${DE_ID}.Coc00000001`,
                            name: 'Measles new 0-11m',
                            shortName: 'Measles new 0-11m',
                        },
                    ],
                }
            }
            if (resource === `dataSets/${DS_ID}`) {
                return {
                    id: DS_ID,
                    name: 'Morbidity',
                    shortName: 'Morbidity',
                    periodType: 'Monthly',
                }
            }
            if (resource === 'indicatorTypes') {
                return { indicatorTypes: [{ id: 'IndType0001' }] }
            }
            if (resource === 'categoryOptionCombos') {
                return { categoryOptionCombos: [{ id: 'DefaultCoc1' }] }
            }
            // Conflict checks against dataElements/predictors/indicators:
            // report a conflict when a probed name is in existingNames
            const filter = String(params?.filter || '')
            const existing = (overrides?.existingNames || []).filter((name) =>
                filter.includes(name)
            )
            return { [resource]: existing.map((name) => ({ name })) }
        },
    })

describe('buildPendingImport', () => {
    it('substitutes every placeholder and applies sharing', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(api, baseRequest, () => {})

        for (const check of [
            pending.outlier,
            pending.consistency,
            pending.completeness,
        ]) {
            expect(JSON.stringify(check.metadata)).not.toContain('§')
            for (const objects of Object.values(check.metadata)) {
                for (const object of objects) {
                    expect(object.sharing).toEqual({
                        public: 'r-------',
                        userGroups: {
                            [USER_GROUP]: {
                                access: 'rw------',
                                id: USER_GROUP,
                            },
                        },
                    })
                }
            }
        }
    })

    it('generates the expected object counts per check', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(api, baseRequest, () => {})

        expect(pending.outlier.metadata.dataElements).toHaveLength(5)
        expect(pending.outlier.metadata.predictors).toHaveLength(5)
        expect(pending.outlier.metadata.indicators).toHaveLength(2)
        expect(pending.consistency.metadata.dataElements).toHaveLength(2)
        expect(pending.consistency.metadata.predictors).toHaveLength(2)
        expect(pending.consistency.metadata.indicators).toHaveLength(1)
        // Standard completeness is a single indicator
        expect(pending.completeness.metadata.dataElements).toBeUndefined()
        expect(pending.completeness.metadata.indicators).toHaveLength(1)
    })

    it('embeds the threshold in generated names and expressions', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(api, baseRequest, () => {})

        const names = (pending.outlier.metadata.dataElements || []).map(
            (dataElement) => dataElement.name
        )
        expect(names).toContain(
            'DQ - Measles new outlier threshold (mean + 3.5 SD)'
        )
        const thresholdPredictor = (
            pending.outlier.metadata.predictors || []
        ).find((predictor) => predictor.name.includes('threshold'))
        expect(thresholdPredictor?.generator?.expression).toContain(
            '(3.5 * stddevPop('
        )
    })

    it('preserves the legacy truncation quirks per check type', async () => {
        const longShortName = 'X'.repeat(50)
        const { api } = makeApi({ deShortName: longShortName })
        const pending = await buildPendingImport(api, baseRequest, () => {})

        // Outliers: >34 chars cut to 35 (NOT 34) — legacy compatibility
        expect(pending.outlier.config['§SHORTNAME§']).toHaveLength(35)
        expect(pending.consistency.config['§SHORTNAME§']).toHaveLength(28)
        expect(pending.completeness.config['§SHORTNAME§']).toHaveLength(30)
    })

    it('uses the proxy operand for completeness when requested', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(
            api,
            {
                ...baseRequest,
                completenessApproach: 'proxy',
                proxyOperandId: `${DE_ID}.Coc00000001`,
            },
            () => {}
        )
        const indicator = (pending.completeness.metadata.indicators || [])[0]
        expect(indicator.numerator).toContain(`#{${DE_ID}.Coc00000001}`)
    })

    it('generates DE + predictor + indicator for the any-value approach', async () => {
        const { api } = makeApi()
        const pending = await buildPendingImport(
            api,
            { ...baseRequest, completenessApproach: 'anyValue' },
            () => {}
        )
        expect(pending.completeness.metadata.dataElements).toHaveLength(1)
        expect(pending.completeness.metadata.predictors).toHaveLength(1)
        expect(pending.completeness.metadata.indicators).toHaveLength(1)
    })

    it('warns when the data set is not monthly', async () => {
        const warnings: string[] = []
        const monthly = makeApi()
        const api = fakeApi({
            onGet: (resource, params) =>
                resource === `dataSets/${DS_ID}`
                    ? {
                          id: DS_ID,
                          name: 'Yearly set',
                          shortName: 'Yearly set',
                          periodType: 'Yearly',
                      }
                    : monthly.api.get(resource, params),
        })
        await buildPendingImport(api.api, baseRequest, (message) =>
            warnings.push(message)
        )
        expect(warnings.join(' ')).toContain('Only monthly data sets')
    })

    describe('conflict detection', () => {
        it('flags names that already exist on the server', async () => {
            const { api } = makeApi({
                existingNames: ['DQ - Measles new outlier count'],
            })
            const pending = await buildPendingImport(api, baseRequest, () => {})
            expect(
                pending.conflicts.has('name:DQ - Measles new outlier count')
            ).toBe(true)
        })

        it('checks comma-containing names with individual eq filters', async () => {
            const commaName = 'BCG doses given Fixed, <1y'
            const { api, calls } = makeApi({ deName: commaName })
            await buildPendingImport(api, baseRequest, () => {})

            const conflictFilters = calls
                .filter(
                    (call) =>
                        call.method === 'get' &&
                        String(call.params?.filter || '').startsWith('name:')
                )
                .map((call) => String(call.params?.filter))

            // Generated names embed the comma-containing DE name, so they
            // must be probed with eq: (in:[…] would split on the comma)
            const eqFilters = conflictFilters.filter((filter) =>
                filter.startsWith('name:eq:')
            )
            expect(eqFilters.length).toBeGreaterThan(0)
            for (const filter of eqFilters) {
                expect(filter).toContain(commaName)
            }
            // and no comma-containing name may appear inside an in:[…] filter
            for (const filter of conflictFilters) {
                if (filter.startsWith('name:in:[')) {
                    expect(filter).not.toContain(commaName)
                }
            }
        })
    })
})
