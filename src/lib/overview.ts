// Assembles the "Configuration" tab data: merges the three dataStore
// arrays into one entry per data element, and checks whether the
// referenced generated metadata still exists.
import { D2Api } from './api'
import { allLabelMaps, formatOuLevelName } from './labels'
import { MetadataKind, PlaceholderConfig, StoreEntry } from './types'

export interface MissingMetadataItem {
    type: MetadataKind
    label: string
    id: string
}

export interface ConfiguredElement {
    id: string
    name: string
    dataSet: string
    configs: Partial<
        Record<'outliers' | 'consistency' | 'completeness', PlaceholderConfig>
    >
    missing: MissingMetadataItem[]
}

export interface OverviewData {
    elements: ConfiguredElement[]
    ouLevelNames: Record<string, string>
}

const getOuLevelMap = async (api: D2Api): Promise<Record<string, string>> => {
    const data = await api.get<{
        organisationUnitLevels: {
            id: string
            level: number
            displayName: string
        }[]
    }>('organisationUnitLevels', {
        fields: 'id,level,displayName',
        paging: false,
    })
    const map: Record<string, string> = {}
    for (const level of data.organisationUnitLevels) {
        // The dataStore stores the organisationUnitLevel UID
        map[level.id] = formatOuLevelName(level.level, level.displayName)
    }
    return map
}

export const assembleOverview = async (api: D2Api): Promise<OverviewData> => {
    const outliers = await api.get<StoreEntry[]>('dataStore/dqConfig/outliers')
    const completeness = await api.get<StoreEntry[]>(
        'dataStore/dqConfig/completeness'
    )
    const consistency = await api.get<StoreEntry[]>(
        'dataStore/dqConfig/consistency'
    )
    const ouLevelNames = await getOuLevelMap(api)

    const configured = new Map<
        string,
        Omit<ConfiguredElement, 'id' | 'missing'>
    >()

    const addToMap = (
        entries: StoreEntry[],
        type: 'outliers' | 'consistency' | 'completeness'
    ): void => {
        for (const item of entries) {
            const [id, config] = Object.entries(item)[0]

            if (type === 'completeness') {
                // Completeness may be stored under an operand id
                // (deId.cocId); merge it into the bare-DE card if present
                const baseId = id.split('.')[0]
                const target = configured.get(id) || configured.get(baseId)
                if (target) {
                    target.configs[type] = config
                    target.dataSet = (config['§NAME_DS§'] as string) || 'N/A'
                } else {
                    configured.set(baseId, {
                        name: config['§NAME§'] as string,
                        dataSet: (config['§NAME_DS§'] as string) || 'N/A',
                        configs: { [type]: config },
                    })
                }
            } else {
                if (!configured.has(id)) {
                    configured.set(id, {
                        name: config['§NAME§'] as string,
                        dataSet: 'N/A',
                        configs: {},
                    })
                }
                const target = configured.get(id)
                if (target) {
                    target.configs[type] = config
                }
            }
        }
    }

    addToMap(outliers, 'outliers')
    addToMap(consistency, 'consistency')
    addToMap(completeness, 'completeness')

    // Collect all referenced generated-metadata IDs grouped by kind
    const referencedByKind: Record<MetadataKind, Set<string>> = {
        dataElement: new Set(),
        predictor: new Set(),
        indicator: new Set(),
    }
    configured.forEach((entry) => {
        for (const config of Object.values(entry.configs)) {
            for (const labelMap of allLabelMaps()) {
                for (const placeholder of Object.keys(labelMap)) {
                    const kind = labelMap[placeholder][0]
                    const id = config?.[placeholder]
                    if (typeof id === 'string' && id) {
                        referencedByKind[kind].add(id)
                    }
                }
            }
        }
    })

    // Batch-query each kind to find which IDs still exist. A null set
    // means the check failed and warnings are suppressed for that kind.
    const endpointByKind: Record<MetadataKind, string> = {
        dataElement: 'dataElements',
        predictor: 'predictors',
        indicator: 'indicators',
    }
    const existingByKind: Record<MetadataKind, Set<string> | null> = {
        dataElement: null,
        predictor: null,
        indicator: null,
    }
    try {
        for (const kind of Object.keys(referencedByKind) as MetadataKind[]) {
            const ids = [...referencedByKind[kind]]
            if (ids.length === 0) {
                continue
            }
            const endpoint = endpointByKind[kind]
            const result = await api.get<Record<string, { id: string }[]>>(
                endpoint,
                {
                    filter: `id:in:[${ids.join(',')}]`,
                    fields: 'id',
                    paging: false,
                }
            )
            existingByKind[kind] = new Set(
                (result[endpoint] || []).map((object) => object.id)
            )
        }
    } catch (error) {
        console.warn(
            'Could not check referenced metadata existence; warnings will be suppressed.',
            error
        )
    }

    const elements: ConfiguredElement[] = []
    configured.forEach((entry, id) => {
        const missing: MissingMetadataItem[] = []
        for (const config of Object.values(entry.configs)) {
            for (const labelMap of allLabelMaps()) {
                for (const placeholder of Object.keys(labelMap)) {
                    const [kind, label] = labelMap[placeholder]
                    const referencedId = config?.[placeholder]
                    if (
                        typeof referencedId === 'string' &&
                        referencedId &&
                        existingByKind[kind] !== null &&
                        !(existingByKind[kind] as Set<string>).has(referencedId)
                    ) {
                        missing.push({ type: kind, label, id: referencedId })
                    }
                }
            }
        }
        elements.push({ id, ...entry, missing })
    })

    return { elements, ouLevelNames }
}
