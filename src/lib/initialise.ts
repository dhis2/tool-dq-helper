// First-run initialisation: creates the admin user group, the metadata
// groups the app manages, and the dqConfig dataStore namespace.
import { D2Api } from './api'
import { generateUids } from './configure'
import { BaseConfig } from './types'

interface Sharing {
    public: string
    userGroups: Record<string, { access: string; id: string }>
}

const makeSharingForGroup = (groupId: string): Sharing => ({
    public: 'r-------',
    userGroups: {
        [groupId]: {
            access: 'rw------',
            id: groupId,
        },
    },
})

interface GroupSpec {
    apiPath: string
    name: string
    shortName: string | null
    sharing: Sharing
}

const findOrCreateGroup = async (
    api: D2Api,
    spec: GroupSpec
): Promise<string> => {
    const { apiPath, name, shortName, sharing } = spec
    const searchResult = await api.get<Record<string, { id: string }[]>>(
        apiPath,
        { filter: `name:eq:${name}`, fields: 'id', paging: false }
    )
    const existing = searchResult[apiPath]
    if (existing && existing.length > 0) {
        return existing[0].id
    }

    const groupId = (await generateUids(api, 1))[0]
    const group: Record<string, unknown> = {
        id: groupId,
        name,
        sharing,
    }
    if (shortName) {
        group.shortName = shortName
    }
    await api.post(apiPath, group)
    return groupId
}

export const initialiseDataStore = async (api: D2Api): Promise<void> => {
    const newBaseConfig: Partial<BaseConfig> = {}
    const me = await api.get<{ id: string }>('me', { fields: 'id' })
    const userId = me.id

    // 1. Admin user group — reuse if it exists, ensure current user is a member
    const ugSearch = await api.get<{
        userGroups: { id: string; users?: { id: string }[] }[]
    }>('userGroups', {
        filter: 'name:eq:DQ - DQ Config Admin',
        fields: 'id,users[id]',
        paging: false,
    })
    const existingUserGroups = ugSearch.userGroups
    let userGroupId: string

    if (existingUserGroups && existingUserGroups.length > 0) {
        userGroupId = existingUserGroups[0].id
        const members = existingUserGroups[0].users || []
        const isMember = members.some((user) => user.id === userId)
        if (!isMember) {
            const group = await api.get<{ users: { id: string }[] }>(
                `userGroups/${userGroupId}`,
                { fields: ':owner' }
            )
            group.users.push({ id: userId })
            await api.put('userGroups', userGroupId, group)
        }
    } else {
        userGroupId = (await generateUids(api, 1))[0]
        await api.post('userGroups', {
            id: userGroupId,
            name: 'DQ - DQ Config Admin',
            sharing: makeSharingForGroup(userGroupId),
            users: [{ id: userId }],
        })
    }
    newBaseConfig.userGroup = userGroupId

    const sharing = makeSharingForGroup(userGroupId)

    // 2. Data element group
    newBaseConfig.dataElementGroup = await findOrCreateGroup(api, {
        apiPath: 'dataElementGroups',
        name: 'DQ - Data quality data elements',
        shortName: 'DQ data elements',
        sharing,
    })

    // 3. Indicator group
    newBaseConfig.indicatorGroup = await findOrCreateGroup(api, {
        apiPath: 'indicatorGroups',
        name: 'DQ - Data quality indicators',
        shortName: 'DQ indicators',
        sharing,
    })

    // 4. Predictor groups (4x)
    newBaseConfig.predictorGroup = await findOrCreateGroup(api, {
        apiPath: 'predictorGroups',
        name: 'DQ - Data quality predictors (all)',
        shortName: 'DQ predictors',
        sharing,
    })
    newBaseConfig.predictorGroupThreshold = await findOrCreateGroup(api, {
        apiPath: 'predictorGroups',
        name: 'DQ - Data quality predictors (thresholds)',
        shortName: null,
        sharing,
    })
    newBaseConfig.predictorGroupAnalysis = await findOrCreateGroup(api, {
        apiPath: 'predictorGroups',
        name: 'DQ - Data quality predictors (analysis)',
        shortName: null,
        sharing,
    })
    newBaseConfig.predictorGroupConsistency = await findOrCreateGroup(api, {
        apiPath: 'predictorGroups',
        name: 'DQ - Data quality predictors (consistency)',
        shortName: null,
        sharing,
    })

    await api.post('dataStore/dqConfig/baseConfig', newBaseConfig)
    await api.post('dataStore/dqConfig/outliers', [])
    await api.post('dataStore/dqConfig/consistency', [])
    await api.post('dataStore/dqConfig/completeness', [])
}

/**
 * Migrate legacy baseConfig keys (from older versions of the tool).
 */
export const migrateBaseConfig = async (
    api: D2Api,
    config: BaseConfig
): Promise<BaseConfig> => {
    let changed = false

    // "predictorGroupTreshold" (typo in early versions) → "predictorGroupThreshold"
    if (config.predictorGroupTreshold && !config.predictorGroupThreshold) {
        config.predictorGroupThreshold = config.predictorGroupTreshold
        delete config.predictorGroupTreshold
        changed = true
    }

    if (changed) {
        await api.put('dataStore/dqConfig', 'baseConfig', config)
    }

    return config
}
