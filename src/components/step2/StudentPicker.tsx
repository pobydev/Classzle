'use client';

// 2단계 다섯 탭이 함께 쓰는 학생 고르기 목록입니다.
// 검색이 맨 위, 반 번호 단추로 전학년도 반을 고르고, 한 줄에 '이름 · 2-1-1 · 여'와 보드와 같은 조건 표시(분, 함, 고, 전)를 둡니다.
// 스크롤은 목록 하나에만 있습니다.

import { useMemo, useState } from 'react';
import { CheckSquare, MagnifyingGlass, Square } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Mark } from '@/components/step3/StudentChip';
import type { RelationIndex } from '@/components/step3/boardModel';
import type { Student } from '@/types';

const classOf = (s: Student) => s.prev_info.split('-')[1] || '';
const numberOf = (s: Student) => parseInt(s.prev_info.split('-')[2] || '0');

export function StudentPicker({
    students,
    relations,
    pickedIds,
    excludeIds,
    multi = false,
    onPick,
    emptyText = '찾는 학생이 없습니다.',
}: {
    students: Student[];
    relations: RelationIndex;
    /** 고른 학생입니다. multi면 체크 표시, 아니면 고른 줄로 보여 줍니다. */
    pickedIds: Set<string>;
    /** 목록에서 뺄 학생입니다. 예: 기준 학생 자신 */
    excludeIds?: Set<string>;
    multi?: boolean;
    onPick: (student: Student) => void;
    emptyText?: string;
}) {
    const [query, setQuery] = useState('');
    const [classFilter, setClassFilter] = useState('all');

    const classes = useMemo(
        () => [...new Set(students.map(classOf))].filter(Boolean).sort((a, b) => parseInt(a) - parseInt(b)),
        [students],
    );

    const sections = useMemo(() => {
        const q = query.trim().toLowerCase();
        const shown = students
            .filter((s) => !excludeIds?.has(s.id))
            .filter((s) => classFilter === 'all' || classOf(s) === classFilter)
            .filter((s) => !q || s.name.toLowerCase().includes(q));
        const byClass = new Map<string, Student[]>();
        shown.forEach((s) => {
            const key = classOf(s) || '기타';
            byClass.set(key, [...(byClass.get(key) ?? []), s]);
        });
        return [...byClass.entries()]
            .sort(([a], [b]) => (a === '기타' ? 1 : b === '기타' ? -1 : parseInt(a) - parseInt(b)))
            .map(([cls, list]) => [cls, list.sort((a, b) => numberOf(a) - numberOf(b) || a.name.localeCompare(b.name))] as const);
    }, [students, excludeIds, classFilter, query]);

    const classButton = (value: string, label: string) => (
        <button
            key={value}
            type="button"
            aria-pressed={classFilter === value}
            aria-label={value === 'all' ? '전체 반' : `전학년도 ${label}반`}
            onClick={() => setClassFilter(value)}
            className={`h-7 min-w-6 cursor-pointer rounded-input px-1 text-small tabular-nums transition-colors focus-visible:outline-2 ${
                classFilter === value ? 'bg-card font-bold text-accent-ink shadow-card' : 'text-soft hover:text-ink'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-student-picker>
            <div className="shrink-0 space-y-2 border-b border-line p-3">
                <div className="relative">
                    <MagnifyingGlass size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-soft" aria-hidden="true" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="이름 찾기"
                        aria-label="학생 이름 찾기"
                        className="h-8 pl-8 text-small"
                    />
                </div>
                <div role="group" aria-label="전학년도 반" className="flex flex-wrap gap-0.5 rounded-button bg-surface-hover p-[3px]">
                    {classButton('all', '전체')}
                    {classes.map((cls) => classButton(cls, cls))}
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                {sections.map(([cls, list]) => (
                    <div key={cls}>
                        <div className="sticky top-0 z-[1] flex justify-between border-b border-line bg-canvas px-3 py-1 text-caption text-soft">
                            <span className="font-semibold">{cls === '기타' ? '반 정보 없음' : `${cls}반`}</span>
                            <span>{list.length}명</span>
                        </div>
                        {list.map((s) => {
                            const picked = pickedIds.has(s.id);
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    data-pick-student={s.id}
                                    aria-pressed={picked}
                                    onClick={() => onPick(s)}
                                    className={`flex h-8 w-full cursor-pointer items-center gap-1.5 border-b border-line px-3 text-left text-small transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 ${
                                        picked ? 'bg-wash text-accent-ink' : 'text-ink hover:bg-wash'
                                    }`}
                                >
                                    {multi && (picked
                                        ? <CheckSquare size={16} weight="fill" className="shrink-0 text-accent" aria-hidden="true" />
                                        : <Square size={16} className="shrink-0 text-control" aria-hidden="true" />)}
                                    <span className={`truncate ${picked ? 'font-semibold' : 'font-medium'}`}>{s.name}</span>
                                    <span className="text-hairline" aria-hidden="true">·</span>
                                    <span className="text-caption text-soft tabular-nums">{s.prev_info}</span>
                                    <span className="text-hairline" aria-hidden="true">·</span>
                                    <span className="text-caption text-soft">{s.gender === 'M' ? '남' : '여'}</span>
                                    <span className="ml-auto flex shrink-0 gap-0.5">
                                        {relations.avoid.has(s.id) && <Mark title="분리 배정 있음">분</Mark>}
                                        {relations.keep.has(s.id) && <Mark title="함께 배정 있음">함</Mark>}
                                        {s.fixed_class && <Mark title={`${s.fixed_class} 고정`}>고</Mark>}
                                        {s.is_pre_transfer && <Mark title="전출 예정">전</Mark>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ))}
                {sections.length === 0 && <p className="py-10 text-center text-small text-soft">{emptyText}</p>}
            </div>
        </div>
    );
}
