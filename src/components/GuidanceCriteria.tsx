// 생활지도 기준 예시입니다. 1단계 학생 표와 3단계 통계 표의 머리글 ? 가 같은 내용을 씁니다.
// 문장은 반별 입력표(src/lib/classSheets.ts)의 기준과 같게 둡니다.

import { ONE_VALUE_RULE } from '@/lib/classSheets';
import { BehaviorIcon } from '@/components/BehaviorChip';
import type { BehaviorType } from '@/types';

export const GUIDANCE_CRITERIA: { type: Exclude<BehaviorType, 'NONE'>; title: string; items: { level: string; text: string }[] }[] = [
    {
        type: 'BEHAVIOR',
        title: '행동 (생활지도 소요)',
        items: [
            { level: '-1', text: '가벼운 딴짓, 관심 필요' },
            { level: '-2', text: '잦은 방해, 지속적 지도 필요' },
            { level: '-3', text: '심각한 방해, 학교폭력 등 집중 관리 필요' },
        ],
    },
    {
        type: 'EMOTIONAL',
        title: '정서 (세심한 배려)',
        items: [
            { level: '-1', text: '다소 예민함, 배려 필요' },
            { level: '-2', text: '교우관계/정서 지원 필요' },
            { level: '-3', text: '특별한 케어/전문가 개입 필요' },
        ],
    },
    {
        type: 'LEADER',
        title: '리더 (영향력)',
        items: [
            { level: '+1', text: '모범적이고 성실한 학생' },
            { level: '+2', text: '리더십이 탁월한 학생 (회장감)' },
        ],
    },
];

export function GuidanceCriteria({ only }: { only?: Exclude<BehaviorType, 'NONE'> }) {
    const groups = only ? GUIDANCE_CRITERIA.filter((g) => g.type === only) : GUIDANCE_CRITERIA;
    return (
        <div className="space-y-2.5" data-guidance-criteria>
            {groups.map((group) => (
                <div key={group.type}>
                    <p className="mb-0.5 flex items-center gap-1 font-semibold text-ink">
                        <BehaviorIcon type={group.type} size={14} />
                        {group.title}
                    </p>
                    <ul className="space-y-0.5 pl-5">
                        {group.items.map((item) => (
                            <li key={item.level}>
                                <span className="inline-block w-6 font-semibold tabular-nums">{item.level}</span>
                                {item.text}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
            {!only && <p className="text-soft">학생마다 값은 하나입니다. {ONE_VALUE_RULE}</p>}
        </div>
    );
}
