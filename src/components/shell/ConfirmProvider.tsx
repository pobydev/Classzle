'use client';

// 윈도우 기본 확인 창과 confirm() 대신 쓰는 앱 안의 확인 창입니다 (brand/DESIGN.md).
//   const confirm = useConfirm();
//   if (await confirm({ title: '지울까요?', confirmLabel: '삭제', danger: true })) { ... }

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export type ConfirmOptions = {
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** 삭제처럼 되돌릴 수 없는 일이면 켭니다. 버튼을 채우지 않습니다. */
    danger?: boolean;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function useConfirm(): Confirm {
    const confirm = useContext(ConfirmContext);
    if (!confirm) throw new Error('ConfirmProvider 안에서만 쓸 수 있습니다.');
    return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    // 닫히는 동안 글자가 비지 않도록 닫아도 지우지 않습니다.
    const [options, setOptions] = useState<ConfirmOptions>({ title: '' });
    const resolver = useRef<((answer: boolean) => void) | null>(null);

    const settle = useCallback((answer: boolean) => {
        resolver.current?.(answer);
        resolver.current = null;
        setIsOpen(false);
    }, []);

    const confirm = useCallback<Confirm>((next) => {
        // 이미 떠 있으면 앞의 질문은 취소로 끝냅니다.
        resolver.current?.(false);
        setOptions(next);
        setIsOpen(true);
        return new Promise<boolean>((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <Dialog open={isOpen} onOpenChange={(open) => !open && settle(false)}>
                <DialogContent
                    showCloseButton={false}
                    className="sm:max-w-[440px]"
                    {...(options.description ? {} : { 'aria-describedby': undefined })}
                >
                    <DialogHeader>
                        <DialogTitle>{options.title}</DialogTitle>
                        {options.description && <DialogDescription>{options.description}</DialogDescription>}
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => settle(false)}>
                            {options.cancelLabel ?? '취소'}
                        </Button>
                        <Button variant={options.danger ? 'destructive' : 'default'} onClick={() => settle(true)}>
                            {options.confirmLabel ?? '확인'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </ConfirmContext.Provider>
    );
}
