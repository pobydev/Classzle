// 왼쪽 사이드바: 로고, 1~3단계, 저장된 작업, 맨 아래 칸 (brand/DESIGN.md)
// 12칸 보드를 볼 때는 56px 아이콘 줄로 접습니다. 눌러서 다시 펼칠 수 있습니다.

import { ArrowRight, ArrowsClockwise, CaretLeft, CaretRight, FloppyDisk, FolderOpen, Question, Trash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UpdateNotice } from './Updates';
import type { SavedProjects } from './useSavedProjects';
import type { Updates } from './useUpdates';

export const STEPS = [
    { value: 'step1', number: 1, label: '기초 정보' },
    { value: 'step2', number: 2, label: '조건 설정' },
    { value: 'step3', number: 3, label: '반 편성' },
] as const;

const SIDE_LINK =
    'flex items-center gap-2 rounded-input px-2 py-1.5 text-body text-soft transition-colors hover:bg-surface-hover hover:text-ink';
const RAIL_BUTTON =
    'relative mx-auto size-9 grid place-items-center rounded-input text-soft transition-colors hover:bg-surface-hover hover:text-ink';

function StepTabs({ isCollapsed }: { isCollapsed: boolean }) {
    return (
        <TabsList className="flex-col items-stretch h-auto w-full bg-transparent p-0 gap-1 rounded-none">
            {STEPS.map((step) => (
                <TabsTrigger
                    key={step.value}
                    value={step.value}
                    aria-label={`${step.number}단계 ${step.label}`}
                    title={isCollapsed ? `${step.number}단계 ${step.label}` : undefined}
                    className={`group/step flex-none h-auto rounded-button border text-ink hover:bg-surface-hover data-[state=active]:bg-wash data-[state=active]:border-tint data-[state=active]:shadow-none data-[state=active]:hover:bg-wash ${
                        isCollapsed ? 'justify-center p-1.5' : 'justify-start gap-2.5 px-2 py-2'
                    }`}
                >
                    <span className="flex-shrink-0 size-6 grid place-items-center rounded-input bg-surface-hover text-small font-semibold text-soft group-data-[state=active]/step:bg-tint group-data-[state=active]/step:text-accent-ink">
                        {step.number}
                    </span>
                    {!isCollapsed && (
                        <>
                            <span>{step.label}</span>
                            <span className="ml-auto size-1.5 rounded-full bg-brand hidden group-data-[state=active]/step:block" />
                        </>
                    )}
                </TabsTrigger>
            ))}
        </TabsList>
    );
}

export function AppSidebar({
    isCollapsed,
    onCollapsedChange,
    projects,
    updates,
    onSave,
    onOpenGuide,
}: {
    isCollapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
    projects: SavedProjects;
    updates: Updates;
    onSave: () => void;
    onOpenGuide: () => void;
}) {
    if (isCollapsed) {
        return (
            <aside
                data-sidebar="collapsed"
                className="flex-shrink-0 w-[56px] border-r border-line bg-card flex flex-col gap-3 py-3 px-1.5"
            >
                <button type="button" onClick={() => onCollapsedChange(false)} aria-label="메뉴 펼치기" className={RAIL_BUTTON}>
                    <CaretRight size={16} />
                </button>
                <StepTabs isCollapsed />
                <div className="flex flex-col gap-1 border-t border-line pt-2">
                    <button type="button" onClick={() => onCollapsedChange(false)} aria-label="저장된 작업" title="저장된 작업" className={RAIL_BUTTON}>
                        <FolderOpen size={18} />
                    </button>
                    <button type="button" onClick={onSave} aria-label="작업 저장" title="작업 저장" className={RAIL_BUTTON}>
                        <FloppyDisk size={18} />
                    </button>
                </div>
                <div className="mt-auto flex flex-col gap-1 border-t border-line pt-2">
                    {updates.hasNotice && (
                        <button
                            type="button"
                            onClick={() => onCollapsedChange(false)}
                            aria-label="새 버전 알림 보기"
                            title="새 버전 알림 보기"
                            data-update-rail
                            className={`${RAIL_BUTTON} text-accent`}
                        >
                            <ArrowsClockwise size={18} />
                            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand ring-2 ring-card" />
                        </button>
                    )}
                    <button type="button" onClick={onOpenGuide} aria-label="Classzle 사용 가이드" title="Classzle 사용 가이드" className={RAIL_BUTTON}>
                        <Question size={18} />
                    </button>
                </div>
            </aside>
        );
    }

    return (
        <aside
            data-sidebar="expanded"
            className="relative flex-shrink-0 w-[240px] border-r border-line bg-card flex flex-col gap-3 pt-[29px] pb-3 px-4"
        >
            <button
                type="button"
                onClick={() => onCollapsedChange(true)}
                aria-label="메뉴 접기"
                className="absolute top-1.5 right-1.5 p-1 rounded-input text-soft transition-colors hover:bg-surface-hover hover:text-ink"
            >
                <CaretLeft size={16} />
            </button>

            <div className="ml-1 mb-4 flex items-center gap-[11px] min-w-0">
                <img src="/icons/classzle-128.png" alt="" className="h-[45px] w-[45px] flex-shrink-0" />
                <div className="min-w-0">
                    <strong className="block text-title !leading-none font-bold text-ink whitespace-nowrap">
                        클래즐
                        <span className="ml-[7px] text-caption font-normal text-soft">Classzle</span>
                    </strong>
                    <small className="slogan block mt-1.5 text-caption !leading-[1.55] text-soft whitespace-nowrap">
                        <span className="block">“완벽한 반 편성을 위한</span>
                        <span className="block">마지막 조각”</span>
                    </small>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <div className="section-label">STEPS</div>
                <StepTabs isCollapsed={false} />
            </div>

            <div className="flex-1 min-h-0 flex flex-col gap-2">
                <div className="section-label">SAVED WORK</div>
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5">
                    {projects.names.length === 0 && (
                        <p className="px-1 text-small text-soft">저장한 작업이 없습니다.</p>
                    )}
                    {projects.names.map((name) => {
                        const isActive = name === projects.activeName;
                        return (
                            <div
                                key={name}
                                className={`group/row flex items-center rounded-button border transition-colors ${
                                    isActive ? 'bg-wash border-tint' : 'border-transparent hover:bg-surface-hover'
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => void projects.load(name)}
                                    aria-current={isActive ? 'true' : undefined}
                                    className={`flex-1 min-w-0 truncate text-left pl-2.5 py-1.5 text-body ${
                                        isActive ? 'font-semibold text-accent-ink' : 'text-ink'
                                    }`}
                                >
                                    {name}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void projects.remove(name)}
                                    aria-label={`${name} 삭제`}
                                    className="flex-shrink-0 mr-1 p-1 rounded-input text-soft opacity-0 transition-opacity hover:text-danger hover:bg-danger-wash focus-visible:opacity-100 group-hover/row:opacity-100"
                                >
                                    <Trash size={14} />
                                </button>
                            </div>
                        );
                    })}
                </div>
                <Button variant="outline" size="sm" onClick={onSave} className="w-full">
                    <FloppyDisk size={16} />
                    작업 저장
                </Button>
                {!window.electronAPI && (
                    <Button variant="ghost" size="sm" onClick={projects.openFile} className="w-full">
                        <FolderOpen size={16} />
                        파일 열기
                    </Button>
                )}
            </div>

            <div className="flex-shrink-0 flex flex-col gap-0.5 border-t border-line pt-2">
                <UpdateNotice updates={updates} />
                <button type="button" onClick={onOpenGuide} className={SIDE_LINK}>
                    <Question size={16} />
                    Classzle 사용 가이드
                    <ArrowRight size={14} className="ml-auto" />
                </button>
            </div>
        </aside>
    );
}
