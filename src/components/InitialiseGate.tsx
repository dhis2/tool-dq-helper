// Blocks the app until the dqConfig dataStore namespace exists, offering
// to initialise it (creates the metadata groups and empty config keys).
import i18n from '@dhis2/d2-i18n'
import {
    Button,
    ButtonStrip,
    Center,
    CircularLoader,
    Modal,
    ModalActions,
    ModalContent,
    ModalTitle,
    NoticeBox,
} from '@dhis2/ui'
import { useQueryClient } from '@tanstack/react-query'
import React, { useState } from 'react'
import { LoadingLayer } from './LoadingLayer'
import { useBaseConfig } from '@/hooks/queries'
import { useApi } from '@/hooks/useApi'
import { useAppAlerts } from '@/hooks/useAppAlerts'
import { errorMessage } from '@/lib/api'
import { initialiseDataStore } from '@/lib/initialise'

export const InitialiseGate = ({ children }: { children: React.ReactNode }) => {
    const api = useApi()
    const queryClient = useQueryClient()
    const alerts = useAppAlerts()
    const { data, isLoading, error } = useBaseConfig()
    const [declined, setDeclined] = useState(false)
    const [initialising, setInitialising] = useState(false)

    if (isLoading) {
        return (
            <Center>
                <CircularLoader />
            </Center>
        )
    }

    if (error) {
        return (
            <NoticeBox error title={i18n.t('Failed to load app')}>
                {errorMessage(error)}
            </NoticeBox>
        )
    }

    if (data?.initialised) {
        return <>{children}</>
    }

    const initialise = async () => {
        setInitialising(true)
        try {
            await initialiseDataStore(api)
            alerts.showSuccess(i18n.t('Initialisation complete.'))
            await queryClient.invalidateQueries()
        } catch (initError) {
            alerts.showError(
                i18n.t('Initialisation failed ({{- message}})', {
                    message: errorMessage(initError),
                })
            )
        } finally {
            setInitialising(false)
        }
    }

    if (declined) {
        return (
            <NoticeBox warning title={i18n.t('Data store not initialised')}>
                {i18n.t(
                    'The app cannot be used until the data store has been initialised.'
                )}{' '}
                <Button small onClick={() => setDeclined(false)}>
                    {i18n.t('Initialise now')}
                </Button>
            </NoticeBox>
        )
    }

    return (
        <>
            {initialising && <LoadingLayer />}
            <Modal position="middle">
                <ModalTitle>{i18n.t('Initialise data store')}</ModalTitle>
                <ModalContent>
                    {i18n.t(
                        'The dataStore structure must be initialised before the app can be used. This will create the required metadata groups and configuration entries.'
                    )}
                </ModalContent>
                <ModalActions>
                    <ButtonStrip end>
                        <Button
                            secondary
                            onClick={() => setDeclined(true)}
                            disabled={initialising}
                        >
                            {i18n.t('Cancel')}
                        </Button>
                        <Button
                            primary
                            onClick={initialise}
                            disabled={initialising}
                        >
                            {i18n.t('Initialise')}
                        </Button>
                    </ButtonStrip>
                </ModalActions>
            </Modal>
        </>
    )
}
