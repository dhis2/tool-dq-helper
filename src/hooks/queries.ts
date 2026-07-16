// TanStack Query hooks for the data the UI reads. Mutating flows
// (preview/import/delete/initialise) call the lib/ functions imperatively
// and invalidate these queries afterwards.
import { useQuery } from '@tanstack/react-query'
import { useApi } from './useApi'
import { migrateBaseConfig } from '@/lib/initialise'
import { assembleOverview, OverviewData } from '@/lib/overview'
import { BaseConfig, StoreEntry } from '@/lib/types'

interface BaseConfigState {
    initialised: boolean
    baseConfig: BaseConfig | null
}

export const useBaseConfig = () => {
    const api = useApi()
    return useQuery<BaseConfigState, Error>({
        queryKey: ['baseConfig'],
        queryFn: async () => {
            const namespaces = await api.get<string[]>('dataStore')
            if (!namespaces || !namespaces.includes('dqConfig')) {
                return { initialised: false, baseConfig: null }
            }
            let baseConfig = await api.get<BaseConfig>(
                'dataStore/dqConfig/baseConfig'
            )
            baseConfig = await migrateBaseConfig(api, baseConfig)
            return { initialised: true, baseConfig }
        },
    })
}

export const useOverview = (enabled: boolean) => {
    const api = useApi()
    return useQuery<OverviewData, Error>({
        queryKey: ['overview'],
        queryFn: () => assembleOverview(api),
        enabled,
    })
}

export interface DataSetListItem {
    id: string
    displayName: string
    periodType?: string
}

export const useDataSets = () => {
    const api = useApi()
    return useQuery<DataSetListItem[], Error>({
        queryKey: ['dataSets'],
        queryFn: async () => {
            const result = await api.get<{ dataSets: DataSetListItem[] }>(
                'dataSets',
                { fields: 'id,displayName', paging: false }
            )
            return [...result.dataSets].sort((a, b) =>
                a.displayName.localeCompare(b.displayName)
            )
        },
    })
}

export interface OuLevelOption {
    id: string
    level: number
    displayName: string
    assigned: boolean
}

export const useOuLevels = (dataSetId: string | undefined) => {
    const api = useApi()
    return useQuery<OuLevelOption[], Error>({
        queryKey: ['ouLevels', dataSetId],
        enabled: Boolean(dataSetId),
        queryFn: async () => {
            // Levels at which the data set is actually assigned
            const dataSetData = await api.get<{
                organisationUnits?: { level: number }[]
            }>(`dataSets/${dataSetId}`, {
                fields: 'organisationUnits[level]',
            })
            const assignedLevels = new Set<number>()
            for (const orgUnit of dataSetData.organisationUnits || []) {
                if (orgUnit.level > 1) {
                    assignedLevels.add(orgUnit.level)
                }
            }

            // All system levels below national
            const levelsData = await api.get<{
                organisationUnitLevels: {
                    id: string
                    level: number
                    displayName: string
                }[]
            }>('organisationUnitLevels', {
                fields: 'id,level,displayName',
                paging: false,
            })
            return levelsData.organisationUnitLevels
                .filter((level) => level.level > 1)
                .sort((a, b) => a.level - b.level)
                .map((level) => ({
                    ...level,
                    assigned: assignedLevels.has(level.level),
                }))
        },
    })
}

export interface CategoryOptionComboRef {
    id: string
    name: string
}

export interface DataElementOption {
    id: string
    name: string
    // Effective category combo (data set override takes precedence)
    catComboName: string
    catComboSource: 'data element' | 'data set override'
    cocs: CategoryOptionComboRef[]
    alreadyConfigured: boolean
}

interface DataElementApiItem {
    id: string
    name: string
    categoryCombo?: {
        id: string
        name: string
        categoryOptionCombos?: CategoryOptionComboRef[]
    }
    dataSetElements?: {
        dataSet?: { id: string }
        categoryCombo?: {
            id: string
            name: string
            categoryOptionCombos?: CategoryOptionComboRef[]
        }
    }[]
}

const NUMERIC_VALUE_TYPES =
    'NUMBER,UNIT_INTERVAL,PERCENTAGE,INTEGER,INTEGER_POSITIVE,INTEGER_NEGATIVE,INTEGER_ZERO_OR_POSITIVE'

export const useDataElements = (dataSetId: string | undefined) => {
    const api = useApi()
    return useQuery<DataElementOption[], Error>({
        queryKey: ['dataElements', dataSetId],
        enabled: Boolean(dataSetId),
        queryFn: async () => {
            const response = await api.get<{
                dataElements: DataElementApiItem[]
            }>('dataElements', {
                filter: [
                    `dataSetElements.dataSet.id:eq:${dataSetId}`,
                    `valueType:in:[${NUMERIC_VALUE_TYPES}]`,
                ],
                fields:
                    'name,id,categoryCombo[id,name,categoryOptionCombos[id,name]],' +
                    'dataSetElements[dataSet[id],categoryCombo[id,name,categoryOptionCombos[id,name]]]',
                paging: false,
            })

            // Data elements already configured for outliers are disabled
            const configuredOutliers = await api.get<StoreEntry[]>(
                'dataStore/dqConfig/outliers'
            )
            const configuredIds = new Set(
                configuredOutliers.flatMap((entry) => Object.keys(entry))
            )

            return [...response.dataElements]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((dataElement) => {
                    // Effective category combo: data set override wins
                    let effectiveCC = dataElement.categoryCombo
                    let source: DataElementOption['catComboSource'] =
                        'data element'
                    const override = (dataElement.dataSetElements || []).find(
                        (dse) =>
                            dse?.dataSet?.id === dataSetId && dse.categoryCombo
                    )
                    if (override) {
                        effectiveCC = override.categoryCombo
                        source = 'data set override'
                    }
                    const cocs = [
                        ...(effectiveCC?.categoryOptionCombos || []),
                    ].sort((a, b) => a.name.localeCompare(b.name))
                    return {
                        id: dataElement.id,
                        name: dataElement.name,
                        catComboName: effectiveCC?.name || 'default',
                        catComboSource: source,
                        cocs,
                        alreadyConfigured: configuredIds.has(dataElement.id),
                    }
                })
        },
    })
}
