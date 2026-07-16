import i18n from '@dhis2/d2-i18n'
import {
    DataTable,
    DataTableBody,
    DataTableCell,
    DataTableColumnHeader,
    DataTableHead,
    DataTableRow,
    Tag,
} from '@dhis2/ui'
import React from 'react'
import { ImportResultRow } from '@/lib/types'

export const ImportResultsTable = ({
    results,
}: {
    results: ImportResultRow[]
}) => (
    <DataTable>
        <DataTableHead>
            <DataTableRow>
                <DataTableColumnHeader>
                    {i18n.t('Import step')}
                </DataTableColumnHeader>
                <DataTableColumnHeader>
                    {i18n.t('Status')}
                </DataTableColumnHeader>
            </DataTableRow>
        </DataTableHead>
        <DataTableBody>
            {results.map((row, index) => (
                <DataTableRow key={index}>
                    <DataTableCell>{row.label}</DataTableCell>
                    <DataTableCell>
                        <Tag positive={row.success} negative={!row.success}>
                            {row.status}
                        </Tag>
                    </DataTableCell>
                </DataTableRow>
            ))}
        </DataTableBody>
    </DataTable>
)
