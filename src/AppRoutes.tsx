import i18n from '@dhis2/d2-i18n'
import { Tab, TabBar } from '@dhis2/ui'
import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import styles from './App.module.css'
import { useBaseConfig } from '@/hooks/queries'
import { BaseConfig } from '@/lib/types'
import { ConfigurePage } from '@/pages/ConfigurePage'
import { InstructionsPage } from '@/pages/InstructionsPage'
import { OverviewPage } from '@/pages/OverviewPage'

const TABS = [
    { path: '/', label: () => i18n.t('Add new') },
    { path: '/configuration', label: () => i18n.t('Configuration') },
    { path: '/instructions', label: () => i18n.t('Instructions') },
]

export const AppRoutes = () => {
    const navigate = useNavigate()
    const location = useLocation()
    // InitialiseGate guarantees this query is resolved and initialised
    const { data } = useBaseConfig()
    const baseConfig = data?.baseConfig as BaseConfig

    // Unknown paths fall back to the first tab
    const activePath = TABS.some((tab) => tab.path === location.pathname)
        ? location.pathname
        : '/'

    // All tabs stay mounted and are toggled with CSS so that form state
    // and un-imported previews survive switching tabs (parity with the
    // pre-platform tool, which used CSS tab toggles).
    const tabStyle = (path: string): React.CSSProperties =>
        path === activePath ? {} : { display: 'none' }

    return (
        <div className={styles.container}>
            <TabBar className={styles.tabBar}>
                {TABS.map((tab) => (
                    <Tab
                        key={tab.path}
                        selected={activePath === tab.path}
                        onClick={() => navigate(tab.path)}
                    >
                        {tab.label()}
                    </Tab>
                ))}
            </TabBar>
            <div style={tabStyle('/')}>
                <ConfigurePage baseConfig={baseConfig} />
            </div>
            <div style={tabStyle('/configuration')}>
                <OverviewPage
                    baseConfig={baseConfig}
                    active={activePath === '/configuration'}
                />
            </div>
            <div style={tabStyle('/instructions')}>
                <InstructionsPage />
            </div>
        </div>
    )
}
