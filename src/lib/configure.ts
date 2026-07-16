// Builds the metadata bundles for a new configuration (the "Preview"
// step): substitutes §PLACEHOLDER§ tokens in the templates, applies
// sharing, and checks for name/shortName conflicts with existing
// metadata.
import { D2Api } from './api'
import {
    templateCompleteness,
    templateCompletenessDisaggregated,
    templateConsistency,
    templateOutlier,
} from './templates'
import {
    CheckImport,
    MetadataBundle,
    NamedRef,
    PlaceholderConfig,
    PendingImport,
} from './types'

type WarningHandler = (message: string) => void

export const generateUids = async (
    api: D2Api,
    count: number
): Promise<string[]> => {
    const data = await api.get<{ codes: string[] }>('system/id', {
        limit: count,
    })
    return data.codes
}

// Cached lookups — avoid repeated API calls and duplicate warnings.
// Module-level caches are safe: these ids never change within a session.
let cachedDefaultCocId: string | null = null
let cachedPercentIndicatorTypeId: string | null = null

const defaultCocId = async (
    api: D2Api,
    onWarning: WarningHandler
): Promise<string> => {
    if (cachedDefaultCocId) {
        return cachedDefaultCocId
    }
    const data = await api.get<{ categoryOptionCombos: { id: string }[] }>(
        'categoryOptionCombos',
        { filter: 'name:eq:default', fields: 'id' }
    )
    const cocs = data.categoryOptionCombos
    if (cocs.length > 1) {
        onWarning(
            'Duplicate default categoryOptionCombos found. Using ' + cocs[0].id
        )
    }
    cachedDefaultCocId = cocs[0].id
    return cachedDefaultCocId
}

const percentIndicatorTypeId = async (
    api: D2Api,
    onWarning: WarningHandler
): Promise<string> => {
    if (cachedPercentIndicatorTypeId) {
        return cachedPercentIndicatorTypeId
    }
    const data = await api.get<{ indicatorTypes: { id: string }[] }>(
        'indicatorTypes',
        {
            fields: 'id',
            filter: ['factor:eq:100', 'number:eq:false'],
        }
    )
    const indicatorTypes = data.indicatorTypes
    if (indicatorTypes.length > 1) {
        onWarning(
            'Duplicate percentage indicator types found. Using the first match.'
        )
    }
    cachedPercentIndicatorTypeId = indicatorTypes[0].id
    return cachedPercentIndicatorTypeId
}

/** Restrict visibility to the app's admin user group. */
const shareMetadata = (metadata: MetadataBundle, groupId: string): void => {
    for (const objects of Object.values(metadata)) {
        for (const object of objects) {
            object.sharing = {
                public: 'r-------',
                userGroups: {
                    [groupId]: {
                        access: 'rw------',
                        id: groupId,
                    },
                },
            }
        }
    }
}

/**
 * Fill a template: every falsy placeholder gets a generated UID, then all
 * placeholders are substituted through the stringified template.
 */
interface TemplateSpec {
    template: MetadataBundle
    config: PlaceholderConfig
    uidCount: number
    userGroupId: string
}

const buildFromTemplate = async (
    api: D2Api,
    spec: TemplateSpec
): Promise<CheckImport> => {
    const { template, config, uidCount, userGroupId } = spec
    const uids = await generateUids(api, uidCount)
    let templateText = JSON.stringify(template)

    for (const placeholder of Object.keys(config)) {
        if (!config[placeholder]) {
            config[placeholder] = uids.pop() as string
        }
        templateText = templateText
            .split(placeholder)
            .join(config[placeholder] as string)
    }

    const metadata = JSON.parse(templateText) as MetadataBundle
    shareMetadata(metadata, userGroupId)
    return { metadata, config }
}

const truncated = (value: string, maxLength: number): string =>
    value.length > maxLength ? value.substring(0, maxLength) : value

// Quirk preserved from the original tool: outlier shortNames over 34
// chars are cut to 35 (not 34). Changing this would alter generated
// shortNames vs metadata created by earlier versions, breaking the
// pre-import conflict check for re-created configurations.
const truncatedOutlierShortName = (value: string): string =>
    value.length > 34 ? value.substring(0, 35) : value

interface ConfigureInputs {
    dataElement: NamedRef // may be a data element or a data element operand
    dataSet: NamedRef
    ouLevelId: string
    threshold: string
    userGroupId: string
}

interface SystemIds {
    inTypeId: string
    cocDefaultId: string
}

const configureOutlierMetadata = (
    api: D2Api,
    inputs: ConfigureInputs,
    ids: SystemIds
): Promise<CheckImport> => {
    const { inTypeId, cocDefaultId } = ids
    const config: PlaceholderConfig = {
        '§NAME§': inputs.dataElement.name,
        '§SHORTNAME§': truncatedOutlierShortName(inputs.dataElement.shortName),
        '§DE_SOURCE§': inputs.dataElement.id,
        '§COC_DEFAULT§': cocDefaultId,
        '§IN_TYPE§': inTypeId,
        '§OU_LEVEL§': inputs.ouLevelId,
        '§VAL_STDDEV§': inputs.threshold,
        '§DE_NOUTLIER_COUNT§': false,
        '§DE_NOUTLIER_VAL§': false,
        '§DE_OUTLIER_COUNT§': false,
        '§DE_OUTLIER_VAL§': false,
        '§DE_THRESHOLD§': false,
        '§IN_NOUTLIER_PROP§': false,
        '§IN_OUTLIER_PROP§': false,
        '§PD_NOUTLIER_COUNT§': false,
        '§PD_NOUTLIER_VAL§': false,
        '§PD_OUTLIER_COUNT§': false,
        '§PD_OUTLIER_VAL§': false,
        '§PD_THRESHOLD§': false,
    }
    return buildFromTemplate(api, {
        template: templateOutlier(),
        config,
        uidCount: 12,
        userGroupId: inputs.userGroupId,
    })
}

const configureConsistencyMetadata = (
    api: D2Api,
    inputs: ConfigureInputs,
    ids: SystemIds
): Promise<CheckImport> => {
    const { inTypeId, cocDefaultId } = ids
    const config: PlaceholderConfig = {
        '§NAME§': inputs.dataElement.name,
        '§SHORTNAME§': truncated(inputs.dataElement.shortName, 28),
        '§DE_SOURCE§': inputs.dataElement.id,
        '§IN_TYPE§': inTypeId,
        '§COC_DEFAULT§': cocDefaultId,
        '§OU_LEVEL§': inputs.ouLevelId,
        '§DE_CONS_ALL§': false,
        '§DE_CONS_ANY§': false,
        '§IN_CONS_PROP§': false,
        '§PD_CONS_ALL§': false,
        '§PD_CONS_ANY§': false,
    }
    return buildFromTemplate(api, {
        template: templateConsistency(),
        config,
        uidCount: 6,
        userGroupId: inputs.userGroupId,
    })
}

const configureCompletenessMetadata = (
    api: D2Api,
    inputs: ConfigureInputs,
    inTypeId: string
): Promise<CheckImport> => {
    const config: PlaceholderConfig = {
        '§NAME§': inputs.dataElement.name,
        '§SHORTNAME§': truncated(inputs.dataElement.shortName, 30),
        '§NAME_DS§': inputs.dataSet.name,
        '§DE_SOURCE§': inputs.dataElement.id,
        '§DS_SOURCE§': inputs.dataSet.id,
        '§IN_TYPE§': inTypeId,
        '§IN_COMPL§': false,
    }
    return buildFromTemplate(api, {
        template: templateCompleteness(),
        config,
        uidCount: 6,
        userGroupId: inputs.userGroupId,
    })
}

const configureCompletenessDisaggregatedMetadata = (
    api: D2Api,
    inputs: ConfigureInputs,
    ids: SystemIds
): Promise<CheckImport> => {
    const { inTypeId, cocDefaultId } = ids
    const config: PlaceholderConfig = {
        '§NAME§': inputs.dataElement.name,
        '§SHORTNAME§': truncated(inputs.dataElement.shortName, 30),
        '§NAME_DS§': inputs.dataSet.name,
        '§DE_SOURCE§': inputs.dataElement.id,
        '§DS_SOURCE§': inputs.dataSet.id,
        '§COC_DEFAULT§': cocDefaultId,
        '§IN_TYPE§': inTypeId,
        '§OU_LEVEL§': inputs.ouLevelId,
        '§DE_COMPL_ANY§': false,
        '§PD_COMPL_ANY§': false,
        '§IN_COMPL_ANY§': false,
    }
    return buildFromTemplate(api, {
        template: templateCompletenessDisaggregated(),
        config,
        uidCount: 6,
        userGroupId: inputs.userGroupId,
    })
}

/**
 * Query one endpoint for existing objects whose <field> matches any of
 * the given values. DHIS2 `in:[…]` filters split on commas, so values
 * containing a comma are checked with individual `eq:` queries instead.
 */
const findExistingValues = async (
    api: D2Api,
    query: { endpoint: string; field: 'name' | 'shortName'; values: string[] }
): Promise<string[]> => {
    const { endpoint, field, values } = query
    const plain = values.filter((value) => !value.includes(','))
    const withComma = values.filter((value) => value.includes(','))

    const filters: string[] = []
    if (plain.length > 0) {
        filters.push(`${field}:in:[${plain.join(',')}]`)
    }
    for (const value of withComma) {
        filters.push(`${field}:eq:${value}`)
    }

    const existing: string[] = []
    for (const filter of filters) {
        const result = await api.get<Record<string, Record<string, string>[]>>(
            endpoint,
            {
                filter,
                fields: field,
                paging: false,
            }
        )
        for (const object of result[endpoint] || []) {
            existing.push(object[field])
        }
    }
    return existing
}

/**
 * Check whether any generated name/shortName already exists on the
 * server. Returns a set of "name:<value>" / "shortName:<value>" strings.
 */
const checkMetadataConflicts = async (
    api: D2Api,
    metadata: MetadataBundle
): Promise<Set<string>> => {
    const conflicts = new Set<string>()
    const checks = ['dataElements', 'predictors', 'indicators'] as const

    for (const endpoint of checks) {
        const items = metadata[endpoint] || []
        if (items.length === 0) {
            continue
        }
        const names = items.map((item) => item.name).filter(Boolean)
        const shortNames = items
            .map((item) => item.shortName)
            .filter(Boolean) as string[]

        if (names.length > 0) {
            try {
                const existing = await findExistingValues(api, {
                    endpoint,
                    field: 'name',
                    values: names,
                })
                for (const name of existing) {
                    conflicts.add('name:' + name)
                }
            } catch (error) {
                console.warn(
                    `Conflict check for ${endpoint} names failed:`,
                    error
                )
            }
        }

        if (shortNames.length > 0) {
            try {
                const existing = await findExistingValues(api, {
                    endpoint,
                    field: 'shortName',
                    values: shortNames,
                })
                for (const shortName of existing) {
                    conflicts.add('shortName:' + shortName)
                }
            } catch (error) {
                console.warn(
                    `Conflict check for ${endpoint} shortNames failed:`,
                    error
                )
            }
        }
    }
    return conflicts
}

export type CompletenessApproach = 'standard' | 'proxy' | 'anyValue'

export interface PreviewRequest {
    // data element id, or operand id (deId.cocId) for a specific disaggregation
    deSourceId: string
    dataSetId: string
    ouLevelId: string
    threshold: string
    completenessApproach: CompletenessApproach
    // operand id to use when completenessApproach === 'proxy'
    proxyOperandId?: string
    userGroupId: string
}

const fetchNamedRef = async (api: D2Api, id: string): Promise<NamedRef> => {
    // Operand ids are "deId.cocId" (23 chars); operands can't be fetched
    // by path, only via filter.
    if (id.length === 23) {
        const result = await api.get<{ dataElementOperands: NamedRef[] }>(
            'dataElementOperands',
            { filter: `id:eq:${id}`, fields: 'name,shortName,id' }
        )
        return result.dataElementOperands[0]
    }
    return api.get<NamedRef>(`dataElements/${id}`, {
        fields: 'name,shortName,id',
    })
}

/**
 * Build all three metadata bundles for the selected configuration and
 * check for conflicts. This is the "Preview" action.
 */
export const buildPendingImport = async (
    api: D2Api,
    request: PreviewRequest,
    onWarning: WarningHandler
): Promise<PendingImport> => {
    const dataElement = await fetchNamedRef(api, request.deSourceId)
    const dataSet = await api.get<NamedRef & { periodType: string }>(
        `dataSets/${request.dataSetId}`,
        { fields: 'name,shortName,id,periodType' }
    )
    if (dataSet.periodType !== 'Monthly') {
        onWarning(
            'Only monthly data sets are automatically supported. Configuration of this dataset must be updated manually.'
        )
    }

    const inTypeId = await percentIndicatorTypeId(api, onWarning)
    const cocId = await defaultCocId(api, onWarning)

    const inputs: ConfigureInputs = {
        dataElement,
        dataSet,
        ouLevelId: request.ouLevelId,
        threshold: request.threshold,
        userGroupId: request.userGroupId,
    }

    const ids: SystemIds = { inTypeId, cocDefaultId: cocId }
    const outlier = await configureOutlierMetadata(api, inputs, ids)
    const consistency = await configureConsistencyMetadata(api, inputs, ids)

    let completeness
    if (request.completenessApproach === 'proxy') {
        // Use one specific disaggregation (operand) as proxy for the whole DE
        const proxyOperand = await fetchNamedRef(
            api,
            request.proxyOperandId as string
        )
        completeness = await configureCompletenessMetadata(
            api,
            { ...inputs, dataElement: proxyOperand },
            inTypeId
        )
    } else if (request.completenessApproach === 'anyValue') {
        completeness = await configureCompletenessDisaggregatedMetadata(
            api,
            inputs,
            ids
        )
    } else {
        completeness = await configureCompletenessMetadata(
            api,
            inputs,
            inTypeId
        )
    }

    const allMetadata = {
        dataElements: [
            ...(outlier.metadata.dataElements || []),
            ...(consistency.metadata.dataElements || []),
            ...(completeness.metadata.dataElements || []),
        ],
        predictors: [
            ...(outlier.metadata.predictors || []),
            ...(consistency.metadata.predictors || []),
            ...(completeness.metadata.predictors || []),
        ],
        indicators: [
            ...(outlier.metadata.indicators || []),
            ...(consistency.metadata.indicators || []),
            ...(completeness.metadata.indicators || []),
        ],
    }
    const conflicts = await checkMetadataConflicts(api, allMetadata)

    return { outlier, consistency, completeness, conflicts }
}
