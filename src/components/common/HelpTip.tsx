'use client';

// 안내 글은 '짧은 한 줄 + 눌러서 여는 ?' 하나로 씁니다. 마우스를 올려서가 아니라 눌러야 열립니다.

import type { ReactNode } from 'react';
import { Question } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function HelpTip({
    label,
    children,
    width = 320,
    className,
}: {
    /** 무엇에 대한 도움말인지. 화면 읽기 프로그램이 '<label> 도움말'로 읽습니다. */
    label: string;
    children: ReactNode;
    width?: number;
    className?: string;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`${label} 도움말`}
                    data-help-trigger={label}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className={cn(
                        'inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full align-middle text-soft transition-colors',
                        'hover:bg-surface-hover hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-1',
                        'data-[state=open]:bg-tint data-[state=open]:text-accent-ink',
                        className,
                    )}
                >
                    <Question size={15} weight="bold" aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                data-help={label}
                style={{ width }}
                className="space-y-2 text-left text-small font-normal tracking-normal whitespace-normal text-ink normal-case [&_strong]:font-semibold"
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </PopoverContent>
        </Popover>
    );
}

/** 짧은 한 줄과 ? 를 나란히 둡니다. */
export function HintLine({ children, help, label, className }: {
    children: ReactNode;
    help?: ReactNode;
    label?: string;
    className?: string;
}) {
    return (
        <p className={cn('flex items-center gap-1 text-small text-soft', className)}>
            <span>{children}</span>
            {help && <HelpTip label={label ?? '안내'}>{help}</HelpTip>}
        </p>
    );
}
