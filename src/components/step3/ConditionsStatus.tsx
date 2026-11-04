'use client';

// 조건 준수 현황 한 줄. 반편성 단추 아래에 두고, 지키지 못한 조건은 눌러서 목록을 봅니다.

import { CaretDown, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { HelpTip } from '@/components/common/HelpTip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Violation } from '@/types';

const CHECKED = '고정 배정, 분리 배정, 함께 배정, 그룹 분산, 인원, 남녀 조건을 봅니다.';

export function ConditionsStatus({ hasAssignments, violations }: { hasAssignments: boolean; violations: Violation[] }) {
    if (!hasAssignments) {
        return <p data-conditions-status className="text-small text-soft">아직 배정하지 않았습니다.</p>;
    }
    if (violations.length === 0) {
        return (
            <p data-conditions-status className="flex items-center gap-1 text-small font-semibold text-accent-ink">
                <CheckCircle size={16} className="shrink-0" aria-hidden="true" />
                조건을 모두 지키고 있습니다
                <HelpTip label="조건">{CHECKED}</HelpTip>
            </p>
        );
    }
    return (
        <div data-conditions-status>
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className="flex cursor-pointer items-center gap-1 rounded-input px-1 text-small font-semibold text-danger hover:bg-danger-wash focus-visible:outline-2 data-[state=open]:bg-danger-wash"
                    >
                        <WarningCircle size={16} className="shrink-0" aria-hidden="true" />
                        지키지 못한 조건 {violations.length}건
                        <CaretDown size={13} aria-hidden="true" />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[460px]">
                    <p className="mb-1.5 font-semibold text-ink">지키지 못한 조건 {violations.length}건</p>
                    <ul className="max-h-64 list-disc space-y-1 overflow-y-auto pl-4 text-small text-ink" data-violation-list>
                        {violations.map((v) => <li key={v.key ?? v.message}>{v.message}</li>)}
                    </ul>
                    <p className="mt-2 text-caption text-soft">{CHECKED} 현재 배정 수정을 고르면 어긴 조건만 고칩니다.</p>
                </PopoverContent>
            </Popover>
        </div>
    );
}
