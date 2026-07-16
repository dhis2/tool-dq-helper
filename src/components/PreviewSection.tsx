// Preview tables for the generated metadata, with conflict highlighting
// on name/shortName cells that already exist on the server.
import i18n from '@dhis2/d2-i18n'
import {
    DataTable,
    DataTableBody,
    DataTableCell,
    DataTableColumnHeader,
    DataTableHead,
    DataTableRow,
} from '@dhis2/ui'
import React from 'react'
import styles from './PreviewSection.module.css'
import { MetadataObject, PendingImport } from '@/lib/types'

interface ColumnSpec {
    header: string
    // Dot-path into the object, e.g. "generator.expression"
    path: string
}

const valueAtPath = (object: MetadataObject, path: string): string => {
    let value: unknown = object
    for (const part of path.split('.')) {
        if (value === null || value === undefined) {
            return ''
        }
        value = (value as Record<string, unknown>)[part]
    }
    return value === null || value === undefined ? '' : String(value)
}

const MetadataTable = ({
    label,
    objects,
    columns,
    conflicts,
}: {
    label: string
    objects: MetadataObject[] | undefined
    columns: ColumnSpec[]
    conflicts: Set<string>
}) => (
    <>
        <p className={styles.tableLabel}>{label}</p>
        {!objects || objects.length === 0 ? (
            <p className={styles.emptyTable}>{i18n.t('N/A')}</p>
        ) : (
            <DataTable className={styles.table}>
                <DataTableHead>
                    <DataTableRow>
                        {columns.map((column) => (
                            <DataTableColumnHeader key={column.path}>
                                {column.header}
                            </DataTableColumnHeader>
                        ))}
                    </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                    {objects.map((object) => (
                        <DataTableRow key={object.id}>
                            {columns.map((column) => {
                                const value = valueAtPath(object, column.path)
                                const isConflict =
                                    (column.path === 'name' ||
                                        column.path === 'shortName') &&
                                    conflicts.has(`${column.path}:${value}`)
                                return (
                                    <DataTableCell
                                        key={column.path}
                                        className={
                                            isConflict
                                                ? styles.conflictCell
                                                : undefined
                                        }
                                    >
                                        {value}
                                        {isConflict ? ' ⚠' : ''}
                                    </DataTableCell>
                                )
                            })}
                        </DataTableRow>
                    ))}
                </DataTableBody>
            </DataTable>
        )}
    </>
)

const CheckPreview = ({
    heading,
    metadata,
    conflicts,
}: {
    heading: string
    metadata: PendingImport['outlier']['metadata']
    conflicts: Set<string>
}) => (
    <div className={styles.checkSection}>
        <h4 className={styles.checkHeading}>{heading}</h4>
        <MetadataTable
            label={i18n.t('Data elements')}
            objects={metadata.dataElements}
            conflicts={conflicts}
            columns={[
                { header: i18n.t('Name'), path: 'name' },
                { header: i18n.t('Short name'), path: 'shortName' },
                { header: i18n.t('Description'), path: 'description' },
            ]}
        />
        <MetadataTable
            label={i18n.t('Predictors')}
            objects={metadata.predictors}
            conflicts={conflicts}
            columns={[
                { header: i18n.t('Name'), path: 'name' },
                { header: i18n.t('Short name'), path: 'shortName' },
                {
                    header: i18n.t('Expression'),
                    path: 'generator.expression',
                },
            ]}
        />
        <MetadataTable
            label={i18n.t('Indicators')}
            objects={metadata.indicators}
            conflicts={conflicts}
            columns={[
                { header: i18n.t('Name'), path: 'name' },
                {
                    header: i18n.t('Numerator description'),
                    path: 'numeratorDescription',
                },
                { header: i18n.t('Numerator'), path: 'numerator' },
                {
                    header: i18n.t('Denominator description'),
                    path: 'denominatorDescription',
                },
                { header: i18n.t('Denominator'), path: 'denominator' },
            ]}
        />
    </div>
)

export const PreviewSection = ({ pending }: { pending: PendingImport }) => (
    <div>
        <CheckPreview
            heading={i18n.t('Outliers')}
            metadata={pending.outlier.metadata}
            conflicts={pending.conflicts}
        />
        <CheckPreview
            heading={i18n.t('Consistency')}
            metadata={pending.consistency.metadata}
            conflicts={pending.conflicts}
        />
        <CheckPreview
            heading={i18n.t('Completeness')}
            metadata={pending.completeness.metadata}
            conflicts={pending.conflicts}
        />
    </div>
)
