import React from 'react'
import styles from './Panel.module.css'

/** White card container used by all pages (single source of card styling). */
export const Panel = ({
    children,
    narrow,
    className,
}: {
    children: React.ReactNode
    // Cap the width — for forms and text content
    narrow?: boolean
    className?: string
}) => (
    <div
        className={[styles.panel, narrow && styles.narrow, className]
            .filter(Boolean)
            .join(' ')}
    >
        {children}
    </div>
)
