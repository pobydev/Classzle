'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, ArrowsLeftRight, CaretDown, CaretRight, Clock } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { changeMentions, groupHistory, summarizeStudentChanges } from '@/lib/history';
import { previousLabel } from '@/lib/report';
import type { AssignmentChange, Student } from '@/types';

type SourceFilter = 'all' | 'manual' | 'auto';

const FILTERS: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'manual', label: '직접 바꾼 것' },
    { value: 'auto', label: '자동 수정' },
];

const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString('ko-KR', {
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

function ChangeLine({ change }: { change: AssignmentChange }) {
    if (change.type === 'swap') {
        return (
            <span className="flex flex-wrap items-center gap-1.5 text-small text-ink">
                <strong>{change.studentName}</strong> {change.oldClass}
                <ArrowsLeftRight size={14} className="text-soft" aria-label="서로 교환" />
                <strong>{change.partnerName}</strong> {change.newClass}
            </span>
        );
    }
    return (
        <span className="flex flex-wrap items-center gap-1.5 text-small text-ink">
            <strong>{change.studentName}</strong> {change.oldClass || '미배정'}
            <ArrowRight size={14} className="text-soft" aria-label="에서" />
            {change.newClass || '미배정'}
        </span>
    );
}

export function HistoryPanel({ history, students }: { history: AssignmentChange[]; students: Student[] }) {
    const [keyword, setKeyword] = useState('');
    const [filter, setFilter] = useState<SourceFilter>('all');
    const [openEntries, setOpenEntries] = useState<Record<string, boolean>>({});

    const search = keyword.trim();

    const summaries = useMemo(() => {
        const list = summarizeStudentChanges(history, students);
        return search ? list.filter((s) => s.name.includes(search)) : list;
    }, [history, students, search]);

    const entries = useMemo(() => {
        return groupHistory(history)
            .filter((entry) => filter === 'all' || entry.source === filter)
            .map((entry) => ({
                ...entry,
                changes: search ? entry.changes.filter((c) => changeMentions(c, search)) : entry.changes,
            }))
            .filter((entry) => entry.changes.length > 0)
            .reverse();
    }, [history, filter, search]);

    const previousOf = useMemo(() => new Map(students.map((s) => [s.id, previousLabel(s)])), [students]);
    const stillMoved = summaries.filter((s) => !s.returned).length;
    const returned = summaries.filter((s) => s.returned).length;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="학생 이름 찾기"
                    aria-label="학생 이름 찾기"
                    className="w-56"
                />
                <div className="flex gap-1" role="group" aria-label="변경 종류 거르기">
                    {FILTERS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            aria-pressed={filter === option.value}
                            onClick={() => setFilter(option.value)}
                            className={`rounded-card border px-3 py-1.5 text-small transition-colors ${filter === option.value
                                ? 'border-accent bg-wash font-semibold text-accent-ink'
                                : 'border-line bg-card text-soft hover:bg-surface-hover'
                                }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <section className="space-y-2" aria-label="학생별 변화">
                <h3 className="text-body font-semibold text-ink">
                    학생별 변화: 처음 반과 다른 학생 {stillMoved}명
                    {returned > 0 && `, 옮겼다 되돌아온 학생 ${returned}명`}
                </h3>
                {summaries.length === 0 ? (
                    <p className="text-small text-soft">찾는 학생이 이력에 없습니다.</p>
                ) : (
                    <div className="max-h-56 divide-y divide-line overflow-y-auto rounded-card border border-line bg-card">
                        {summaries.map((s) => (
                            <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2 text-small">
                                <span>
                                    <span className="font-semibold text-ink">{s.name}</span>
                                    {previousOf.get(s.id) && <span className="ml-1.5 text-caption text-soft">{previousOf.get(s.id)}</span>}
                                </span>
                                <span className="flex items-center gap-2 text-soft">
                                    {s.firstClass || '미배정'}
                                    <ArrowRight size={13} className="text-soft" aria-label="에서" />
                                    <strong>{s.currentClass || '미배정'}</strong>
                                    {s.returned && <Badge variant="outline" className="text-caption">되돌아옴</Badge>}
                                    {s.moveCount > 1 && <span className="text-caption text-soft">{s.moveCount}번 옮김</span>}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="space-y-2" aria-label="변경 기록">
                <h3 className="text-body font-semibold text-ink">변경 기록 (최근 순)</h3>
                {entries.length === 0 ? (
                    <p className="text-small text-soft">조건에 맞는 기록이 없습니다.</p>
                ) : (
                    <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-card border border-line bg-card">
                        {entries.map((entry) => {
                            if (entry.source === 'manual') {
                                return (
                                    <div key={entry.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                                        <ChangeLine change={entry.changes[0]} />
                                        <span className="flex items-center gap-2 text-caption text-soft">
                                            <Badge variant="outline" className="text-caption">직접</Badge>
                                            <Clock size={13} aria-hidden="true" />
                                            {formatTime(entry.timestamp)}
                                        </span>
                                    </div>
                                );
                            }
                            const isOpen = !!openEntries[entry.key] || search !== '';
                            return (
                                <div key={entry.key}>
                                    <button
                                        type="button"
                                        aria-expanded={isOpen}
                                        onClick={() => setOpenEntries((prev) => ({ ...prev, [entry.key]: !prev[entry.key] }))}
                                        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-hover"
                                    >
                                        <span className="flex items-center gap-2 text-small font-semibold text-ink">
                                            {isOpen ? <CaretDown size={14} aria-hidden="true" /> : <CaretRight size={14} aria-hidden="true" />}
                                            자동 수정: {entry.changes.length}건
                                        </span>
                                        <span className="flex items-center gap-2 text-caption text-soft">
                                            <Badge variant="outline" className="text-caption">자동</Badge>
                                            <Clock size={13} aria-hidden="true" />
                                            {formatTime(entry.timestamp)}
                                        </span>
                                    </button>
                                    {isOpen && (
                                        <ul className="space-y-1.5 bg-canvas px-10 py-2.5">
                                            {entry.changes.map((change, index) => (
                                                <li key={`${change.studentId}-${index}`}>
                                                    <ChangeLine change={change} />
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
