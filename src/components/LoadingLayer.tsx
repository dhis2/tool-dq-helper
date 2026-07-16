import { Center, CircularLoader, Layer } from '@dhis2/ui'

/** Full-screen translucent overlay shown during long-running operations. */
export const LoadingLayer = () => (
    <Layer translucent>
        <Center>
            <CircularLoader />
        </Center>
    </Layer>
)
