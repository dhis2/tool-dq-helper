import i18n from '@dhis2/d2-i18n'
import { InputField } from '@dhis2/ui'
import React from 'react'

export const isValidThreshold = (value: string): boolean =>
    Boolean(value) && parseFloat(value) >= 2 && parseFloat(value) <= 4

/** Number input for the outlier threshold (2.0–4.0 SD), with validation. */
export const ThresholdField = ({
    label,
    value,
    onChange,
}: {
    label: string
    value: string
    onChange: (value: string) => void
}) => {
    const showError = Boolean(value) && !isValidThreshold(value)
    return (
        <InputField
            label={label}
            type="number"
            min="2"
            max="4"
            step="0.1"
            value={value}
            error={showError}
            validationText={
                showError
                    ? i18n.t('Threshold must be between 2 and 4.')
                    : undefined
            }
            onChange={({ value: newValue }) => onChange(newValue || '')}
        />
    )
}
