import { useEffect, useState } from 'react';
import { isFound, readCheckOnStart, writeCheckOnStart } from '@/lib/updates';
import type { FoundUpdate, UpdateStatus } from '@/lib/updates';

export type Updates = ReturnType<typeof useUpdates>;

const CHECK_DELAY_MS = 5000;

/** 설치본에서만 동작합니다. 웹과 개발 모드에서는 isSupported가 false입니다. */
export function useUpdates() {
    const [isSupported, setIsSupported] = useState(false);
    const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
    const [checkOnStart, setCheckOnStart] = useState(readCheckOnStart);
    // 나중에, 닫기를 누른 상태입니다. 다음에 켜면 다시 묻도록 저장하지 않습니다.
    const [dismissedState, setDismissedState] = useState<FoundUpdate['state'] | null>(null);
    const [hasAsked, setHasAsked] = useState(false);

    useEffect(() => {
        const api = window.electronAPI;
        let isMounted = true;
        const unsubscribe = api?.onUpdateStatus?.(setStatus);
        api?.getUpdateInfo?.().then((info) => {
            if (!isMounted) return;
            setIsSupported(info.updates === 'on');
            setStatus(info.status);
        });
        return () => {
            isMounted = false;
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        if (!isSupported) return;
        const timer = window.setTimeout(() => {
            // 켠 직후에 스위치를 끈 경우도 지킵니다.
            if (readCheckOnStart()) void window.electronAPI?.checkForUpdates?.();
        }, CHECK_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [isSupported]);

    const found = isFound(status) ? status : null;

    return {
        isSupported,
        status,
        found,
        /** 사이드바에 알림을 보여 줄 때입니다. */
        hasNotice: found !== null && dismissedState !== found.state,
        checkOnStart,
        hasAsked,
        setCheckOnStart: (isOn: boolean) => {
            writeCheckOnStart(isOn);
            setCheckOnStart(isOn);
        },
        dismiss: () => {
            if (found) setDismissedState(found.state);
        },
        check: () => {
            setHasAsked(true);
            void window.electronAPI?.checkForUpdates?.();
        },
        download: () => void window.electronAPI?.downloadUpdate?.(),
        install: () => void window.electronAPI?.installUpdate?.(),
    };
}
