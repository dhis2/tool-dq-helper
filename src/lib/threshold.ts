// Editing the outlier threshold (standard deviations) of an existing
// configuration: renames the affected metadata objects and updates the
// predictor expression, then records the new value in the dataStore.
import { D2Api } from './api'
import { MetadataObject, StoreEntry } from './types'

/**
 * Replace the old SD value with the new one in the strings the templates
 * embed it in. Targeted replacements so unrelated numbers are untouched.
 */
const replaceSD = (value: string, oldSD: string, newSD: string): string =>
    value
        .split(`mean + ${oldSD} SD`)
        .join(`mean + ${newSD} SD`)
        .split(`${oldSD} standard deviations`)
        .join(`${newSD} standard deviations`)
        .split(`(${oldSD} * stddevPop`)
        .join(`(${newSD} * stddevPop`)
        .split(`+ ${oldSD} SD)`)
        .join(`+ ${newSD} SD)`)

/** Fetch the objects, apply `mutate` to each, and import them back. */
const updateObjects = async (
    api: D2Api,
    spec: {
        endpoint: 'dataElements' | 'predictors' | 'indicators'
        ids: string[]
        mutate: (object: MetadataObject) => void
    }
): Promise<void> => {
    const { endpoint, ids, mutate } = spec
    if (ids.length === 0) {
        return
    }
    const result = await api.get<Record<string, MetadataObject[]>>(endpoint, {
        filter: `id:in:[${ids.join(',')}]`,
        fields: ':owner',
        paging: false,
    })
    const objects = result[endpoint] || []
    if (objects.length === 0) {
        return
    }
    objects.forEach(mutate)
    await api.post('metadata', { [endpoint]: objects })
}

export const updateOutlierThreshold = async (
    api: D2Api,
    deId: string,
    newSD: string
): Promise<void> => {
    const outliers = await api.get<StoreEntry[]>('dataStore/dqConfig/outliers')
    const entryIndex = outliers.findIndex(
        (item) => Object.keys(item)[0] === deId
    )
    if (entryIndex === -1) {
        throw new Error('Outlier configuration not found.')
    }
    const config = outliers[entryIndex][deId]
    const oldSD = config['§VAL_STDDEV§'] as string

    const substitute = (value?: string): string =>
        replaceSD(value || '', oldSD, newSD)
    const rename = (object: MetadataObject): void => {
        object.name = substitute(object.name)
        object.shortName = substitute(object.shortName)
        object.description = substitute(object.description)
    }

    const configIds = (keys: string[]): string[] =>
        keys
            .map((key) => config[key])
            .filter((value): value is string => Boolean(value))

    // Only names/descriptions/expressions that embed the SD value change
    await updateObjects(api, {
        endpoint: 'dataElements',
        ids: configIds(['§DE_THRESHOLD§', '§DE_NOUTLIER_VAL§']),
        mutate: rename,
    })
    const thresholdPredictorIds = configIds(['§PD_THRESHOLD§'])
    await updateObjects(api, {
        endpoint: 'predictors',
        ids: thresholdPredictorIds,
        mutate: (predictor) => {
            rename(predictor)
            if (predictor.generator) {
                predictor.generator.expression = substitute(
                    predictor.generator.expression
                )
                predictor.generator.description = substitute(
                    predictor.generator.description
                )
                if (predictor.generator.displayDescription) {
                    predictor.generator.displayDescription = substitute(
                        predictor.generator.displayDescription
                    )
                }
            }
        },
    })
    await updateObjects(api, {
        endpoint: 'indicators',
        ids: configIds(['§IN_NOUTLIER_PROP§', '§IN_OUTLIER_PROP§']),
        mutate: rename,
    })

    config['§VAL_STDDEV§'] = newSD
    // Record when the app itself modified the generated metadata, so the
    // deletion safety gate can distinguish app edits from manual edits.
    // The timestamp MUST come from the server, not the client clock:
    // DHIS2 returns zone-less date strings, so comparing a client-side
    // UTC timestamp against them skews by the browser's timezone offset.
    if (thresholdPredictorIds.length > 0) {
        const stamp = await api.get<{ lastUpdated: string }>(
            `predictors/${thresholdPredictorIds[0]}`,
            { fields: 'lastUpdated' }
        )
        config.editedAt = stamp.lastUpdated
    }
    outliers[entryIndex] = { [deId]: config }
    await api.put('dataStore/dqConfig', 'outliers', outliers)
}
