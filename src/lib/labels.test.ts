import {
    collectTemplateEntries,
    formatOuLevelName,
    kindFromPlaceholder,
    labelForPlaceholder,
    templateToRegex,
} from './labels'

describe('templateToRegex', () => {
    it('matches any substitution at placeholder positions', () => {
        const regex = templateToRegex('DQ - §NAME§ outlier count')
        expect(regex.test('DQ - Measles new outlier count')).toBe(true)
        expect(
            regex.test('DQ - BCG doses given Fixed, <1y outlier count')
        ).toBe(true)
    })

    it('anchors the whole string', () => {
        const regex = templateToRegex('DQ - §NAME§ outlier count')
        expect(regex.test('XX DQ - Foo outlier count')).toBe(false)
        expect(regex.test('DQ - Foo outlier count (edited)')).toBe(false)
    })

    it('escapes regex metacharacters in fixed template text', () => {
        const regex = templateToRegex('DQ - §NAME§ excluding outliers (%)')
        expect(regex.test('DQ - Foo excluding outliers (%)')).toBe(true)
        // Without escaping, "(%)" would be a regex group, not literal text
        expect(regex.test('DQ - Foo excluding outliers %')).toBe(false)
    })
})

describe('collectTemplateEntries', () => {
    const entries = collectTemplateEntries()

    it('collects every placeholder that appears as a template id', () => {
        expect(Object.keys(entries)).toEqual(
            expect.arrayContaining([
                '§DE_OUTLIER_COUNT§',
                '§PD_THRESHOLD§',
                '§IN_COMPL§',
                '§DE_CONS_ALL§',
            ])
        )
    })

    it('uses generator.description for predictors (deletion gate contract)', () => {
        // Consistency predictors have BOTH a top-level and a generator
        // description; the gate compares generator.description
        expect(entries['§PD_CONS_ALL§'].description).toBe(
            '§NAME§ reported in all the previous 12 months'
        )
    })

    it('derives the metadata kind from the collection', () => {
        expect(entries['§DE_OUTLIER_COUNT§'].kind).toBe('dataElement')
        expect(entries['§PD_THRESHOLD§'].kind).toBe('predictor')
        expect(entries['§IN_COMPL§'].kind).toBe('indicator')
    })
})

describe('kindFromPlaceholder', () => {
    it.each([
        ['§DE_OUTLIER_COUNT§', 'dataElement'],
        ['§PD_THRESHOLD§', 'predictor'],
        ['§IN_COMPL§', 'indicator'],
    ])('%s → %s', (placeholder, kind) => {
        expect(kindFromPlaceholder(placeholder)).toBe(kind)
    })

    it('returns null for non-metadata placeholders', () => {
        expect(kindFromPlaceholder('§NAME§')).toBeNull()
        expect(kindFromPlaceholder('§OU_LEVEL§')).toBeNull()
    })
})

describe('labelForPlaceholder', () => {
    it('resolves labels from any check type', () => {
        expect(labelForPlaceholder('§IN_CONS_PROP§')).toBe(
            'Consistent reporting (%)'
        )
    })

    it('falls back to the key itself', () => {
        expect(labelForPlaceholder('§UNKNOWN§')).toBe('§UNKNOWN§')
    })
})

describe('formatOuLevelName', () => {
    it('formats as "Level N - Name"', () => {
        expect(formatOuLevelName(4, 'Facility')).toBe('Level 4 - Facility')
    })
})
