'use client';

// 단계 사이를 오가는 버튼은 1, 2, 3단계 모두 화면 맨 아래 같은 자리의 얇은 줄에 둡니다.

import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

interface StepLink {
    label: string;
    onClick: () => void;
    disabled?: boolean;
}

export function StepFooter({ back, next, hint }: { back?: StepLink; next?: StepLink; hint?: ReactNode }) {
    return (
        <footer data-step-footer className="flex h-12 shrink-0 items-center gap-3 border-t border-line bg-card px-5">
            {back && (
                <Button variant="ghost" size="sm" onClick={back.onClick} disabled={back.disabled} className="-ml-2.5">
                    <ArrowLeft aria-hidden="true" />이전: {back.label}
                </Button>
            )}
            <div className="ml-auto flex items-center gap-3">
                {hint && <span className="text-caption text-soft">{hint}</span>}
                {next && (
                    <Button size="sm" onClick={next.onClick} disabled={next.disabled}>
                        다음: {next.label}<ArrowRight aria-hidden="true" />
                    </Button>
                )}
            </div>
        </footer>
    );
}
