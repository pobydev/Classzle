'use client';

import { CheckCircle, Lightbulb, WarningCircle } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import type { calculateClassStats, PreviousClassLevels } from '@/lib/stats';
import type { CustomGroup, Violation } from '@/types';
import { Mark } from './StudentChip';

type ClassStat = ReturnType<typeof calculateClassStats>[number];

const TH = 'bg-canvas px-3 py-2 text-caption font-semibold text-soft first:rounded-tl-card last:rounded-tr-card';

function Count({ tone, label, value }: { tone?: 'level3' | 'level2' | 'level1' | 'leader'; label: string; value: number }) {
    return (
        <span className="inline-flex items-center gap-1">
            <Mark tone={tone}>{label}</Mark>
            <span className="w-3 text-caption font-semibold text-ink tabular-nums">{value}</span>
        </span>
    );
}

export function BalanceTables({ classStats, groups, previousClassLevels }: {
    classStats: ClassStat[];
    groups: CustomGroup[];
    previousClassLevels: PreviousClassLevels[];
}) {
    return (
        <>
            <div className="rounded-card bg-card p-4 shadow-card">
                <p className="mb-4 flex items-start gap-2 rounded-button bg-wash px-3 py-2 text-small text-accent-ink">
                    <Lightbulb size={16} className="mt-0.5 shrink-0" />
                    <span>
                        <strong>생활지도 균형</strong>: 합계가 아니라 등급별 학생 수로 맞춥니다. -3, -2 학생은 반별 차이 1명을 목표로 하고, 리더는 따로 세어 고르게 나눕니다. 인원, 평균, 남녀, 등급별 인원은 전출 뒤 기준입니다.
                    </span>
                </p>
                <table className="w-full border-collapse text-small">
                    <thead className="sticky top-12 z-[5]">
                        <tr>
                            <th className={`${TH} text-left`}>반</th>
                            <th className={`${TH} text-center`}>인원</th>
                            <th className={`${TH} text-center`}>평균</th>
                            <th className={`${TH} text-center`}>남/여</th>
                            <th className={`${TH} text-center`}>생활지도 점수별 학생수</th>
                            <th className={`${TH} text-center`}>-3 / -2 / -1 / 리더</th>
                            {groups.length > 0 && <th className={`${TH} text-center`}>분산 배정 그룹</th>}
                            <th className={`${TH} text-center`}>전출(남/여)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {classStats.map((stat) => (
                            <tr key={stat.className} className="border-b border-line hover:bg-wash">
                                <td className="px-3 py-2 font-bold text-ink">{stat.className}</td>
                                <td className="px-3 py-2 text-center">
                                    {stat.stayCount}
                                    {stat.preTransferCount > 0 && (
                                        <span className="block text-caption text-soft">전출 전 {stat.studentCount}</span>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-center tabular-nums">{stat.stayAverageScore}</td>
                                <td className="px-3 py-2 text-center text-soft tabular-nums">{stat.stayMaleCount}/{stat.stayFemaleCount}</td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center justify-center gap-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5">
                                                <Count tone="level3" label="행-3" value={stat.behaviorPlus3} />
                                                <Count tone="level2" label="행-2" value={stat.behaviorPlus2} />
                                                <Count tone="level1" label="행-1" value={stat.behaviorPlus1} />
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Count tone="level3" label="정-3" value={stat.emotionalPlus3} />
                                                <Count tone="level2" label="정-2" value={stat.emotionalPlus2} />
                                                <Count tone="level1" label="정-1" value={stat.emotionalPlus1} />
                                            </div>
                                        </div>
                                        <Count label="일반 0" value={stat.normalCount} />
                                        <div className="flex flex-col gap-1">
                                            <Count tone="leader" label="리+1" value={stat.scorePlus1} />
                                            <Count tone="leader" label="리+2" value={stat.scorePlus2} />
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-center font-semibold text-ink tabular-nums">
                                    {stat.minus3Count} / {stat.minus2Count} / {stat.minus1Count} / {stat.leaderCount}
                                </td>
                                {groups.length > 0 && (
                                    <td className="px-3 py-2 text-center">
                                        {groups.map((g) => (
                                            <Badge key={g.id} title={g.name} className={`${g.color} mr-1 mb-1 px-1 py-0`}>
                                                {g.name.substring(0, 1)}:{stat.groupCounts[g.id] || 0}
                                            </Badge>
                                        ))}
                                    </td>
                                )}
                                <td className="px-3 py-2 text-center text-soft tabular-nums">
                                    {stat.preTransferMaleCount + stat.preTransferFemaleCount > 0
                                        ? `${stat.preTransferMaleCount}/${stat.preTransferFemaleCount}`
                                        : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {previousClassLevels.length > 1 && (
                <div className="rounded-card bg-card p-4 shadow-card">
                    <h4 className="text-body font-bold text-ink">전학년도 반별 생활지도 등급 인원</h4>
                    <p className="mt-1 mb-4 text-small text-soft">
                        담임 선생님마다 기준이 다를 수 있습니다. 한 반만 유독 많거나 적으면 배정 전에 점수를 살펴봐 주세요. 점수를 자동으로 고치지는 않습니다. 기준 예시는 아래 점수 기준 상세 안내에 있습니다.
                    </p>
                    <table className="w-full border-collapse text-small">
                        <thead>
                            <tr>
                                <th className={`${TH} text-left`}>전학년도 반</th>
                                <th className={`${TH} text-center`}>학생</th>
                                <th className={`${TH} text-center`}>-3</th>
                                <th className={`${TH} text-center`}>-2</th>
                                <th className={`${TH} text-center`}>-1</th>
                                <th className={`${TH} text-center`}>리더</th>
                            </tr>
                        </thead>
                        <tbody>
                            {previousClassLevels.map((row) => (
                                <tr key={row.previousClass} className="border-b border-line hover:bg-wash">
                                    <td className="px-3 py-1.5 font-semibold text-ink">{row.previousClass}반</td>
                                    <td className="px-3 py-1.5 text-center tabular-nums">{row.total}</td>
                                    <td className="px-3 py-1.5 text-center tabular-nums">{row.minus3}</td>
                                    <td className="px-3 py-1.5 text-center tabular-nums">{row.minus2}</td>
                                    <td className="px-3 py-1.5 text-center tabular-nums">{row.minus1}</td>
                                    <td className="px-3 py-1.5 text-center tabular-nums">{row.leader}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

function CriteriaColumn({ mark, tone, title, items }: {
    mark: string;
    tone: 'level3' | 'level2' | 'leader';
    title: string;
    items: { level: string; text: string }[];
}) {
    return (
        <div>
            <h5 className="mb-2 flex items-center gap-1 text-small font-bold text-ink">
                <Mark tone={tone}>{mark}</Mark> {title}
            </h5>
            <ul className="space-y-1.5 text-caption text-soft">
                {items.map((item) => (
                    <li key={item.level}><strong className="text-ink">{item.level}</strong>: {item.text}</li>
                ))}
            </ul>
        </div>
    );
}

export function LegendCriteriaStatus({ hasAssignments, violations }: { hasAssignments: boolean; violations: Violation[] }) {
    return (
        <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-caption text-soft">
                <span className="font-bold text-ink">범례</span>
                <span className="flex items-center gap-1"><Mark tone="level3">행-3</Mark> 행동 -3</span>
                <span className="flex items-center gap-1"><Mark tone="level2">행-2</Mark> 행동 -2</span>
                <span className="flex items-center gap-1"><Mark tone="level1">행-1</Mark> 행동 -1</span>
                <span className="flex items-center gap-1"><Mark tone="level3">정-3</Mark> 정서 -3</span>
                <span className="flex items-center gap-1"><Mark tone="level2">정-2</Mark> 정서 -2</span>
                <span className="flex items-center gap-1"><Mark tone="level1">정-1</Mark> 정서 -1</span>
                <span className="flex items-center gap-1"><Mark>일반 0</Mark> 일반</span>
                <span className="flex items-center gap-1"><Mark tone="leader">리+1</Mark> 리더 +1</span>
                <span className="flex items-center gap-1"><Mark tone="leader">리+2</Mark> 리더 +2</span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-card bg-card p-4 shadow-card">
                    <h4 className="mb-3 flex items-center gap-1.5 text-body font-bold text-ink">
                        <Lightbulb size={16} className="text-brand" /> 점수 기준 상세 안내
                    </h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <CriteriaColumn
                            mark="행"
                            tone="level2"
                            title="행동 (생활지도 소요)"
                            items={[
                                { level: '-1', text: '가벼운 딴짓, 관심 필요' },
                                { level: '-2', text: '잦은 방해, 지속적 지도 필요' },
                                { level: '-3', text: '심각한 방해, 학교폭력 등 집중 관리 필요' },
                            ]}
                        />
                        <CriteriaColumn
                            mark="정"
                            tone="level2"
                            title="정서 (세심한 배려)"
                            items={[
                                { level: '-1', text: '다소 예민함, 배려 필요' },
                                { level: '-2', text: '교우관계/정서 지원 필요' },
                                { level: '-3', text: '특별한 케어/전문가 개입 필요' },
                            ]}
                        />
                        <CriteriaColumn
                            mark="리"
                            tone="leader"
                            title="리더 (영향력)"
                            items={[
                                { level: '+1', text: '모범적이고 성실한 학생' },
                                { level: '+2', text: '리더십이 탁월한 학생 (회장감)' },
                            ]}
                        />
                    </div>
                </div>

                <div className="rounded-card bg-card p-4 shadow-card" data-conditions-status>
                    <h4 className="mb-2 flex items-center gap-1.5 text-body font-bold text-ink">
                        <WarningCircle size={16} className="text-danger" /> 제약 조건 준수 현황
                    </h4>
                    {!hasAssignments ? (
                        <p className="text-small text-soft">아직 배정하지 않았습니다.</p>
                    ) : violations.length > 0 ? (
                        <div className="space-y-2">
                            <p className="text-small font-bold text-danger">지키지 못한 조건이 {violations.length}건 있습니다.</p>
                            <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-caption text-ink">
                                {violations.map((v) => <li key={v.key ?? v.message}>{v.message}</li>)}
                            </ul>
                        </div>
                    ) : (
                        <p className="flex items-start gap-1.5 text-small font-semibold text-accent-ink">
                            <CheckCircle size={16} className="mt-0.5 shrink-0" />
                            고정 반, 떼어 놓기, 함께 두기, 그룹, 인원, 남녀 조건을 모두 지키고 있습니다.
                        </p>
                    )}
                </div>
            </div>
        </>
    );
}
