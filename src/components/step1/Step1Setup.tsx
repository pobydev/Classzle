'use client';

// 1단계 기초 정보. 파일을 넣기 전에는 파일 상자 하나만, 넣은 뒤에는 요약 줄 한 줄과 학생 표만 보여 줍니다.

import { useCallback, useMemo, useState } from 'react';
import {
    CaretDown,
    DownloadSimple,
    FileXls,
    MagnifyingGlass,
    Plus,
    Question,
    Trash,
    UploadSimple,
    WarningCircle,
    X,
} from '@phosphor-icons/react';
import { useClasszleStore } from '@/lib/store';
import { parseExcelFile, downloadSampleExcel, downloadPreAssignedSampleExcel } from '@/lib/excel';
import type { BehaviorType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HelpTip } from '@/components/common/HelpTip';
import { MoreMenu, MoreMenuItem, MoreMenuLabel, MoreMenuSeparator } from '@/components/common/MoreMenu';
import { GuidanceCriteria } from '@/components/GuidanceCriteria';
import { useConfirm } from '@/components/shell/ConfirmProvider';
import { removalConsequences } from '@/lib/studentRemoval';
import { BehaviorPickerHeader, KeyboardHint } from './BehaviorPicker';
import { ClassSheetMenu } from './ClassSheetMenu';
import { StudentTableRow } from './StudentTableRow';
import { ExcelGuideDialog } from './ExcelGuideDialog';
import { AddStudentDialog } from './AddStudentDialog';

const TH = 'h-9 border-b border-line bg-canvas px-2 text-center text-caption font-normal whitespace-nowrap text-soft';

/** 불러온 뒤 안내: 접힌 한 줄로 두고 눌러서 펼칩니다. */
function NoticesLine({ notices, onClose }: { notices: string[]; onClose: () => void }) {
    const [open, setOpen] = useState(false);
    if (notices.length === 0) return null;
    return (
        <section data-import-notices aria-label="불러온 뒤 안내" className="shrink-0 rounded-card bg-card shadow-card">
            <div className="flex h-10 items-center gap-2 pr-2 pl-4">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-input text-left text-small focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                    <WarningCircle size={16} className="shrink-0 text-accent" aria-hidden="true" />
                    <span className="shrink-0 font-semibold text-ink">안내 {notices.length}건</span>
                    {!open && <span className="truncate text-soft">{notices[0]}</span>}
                    <CaretDown size={14} className={`shrink-0 text-soft transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                <Button variant="ghost" size="sm" onClick={onClose}>닫기</Button>
            </div>
            <ul hidden={!open} className="max-h-48 space-y-1.5 overflow-y-auto border-t border-line px-4 py-2.5 text-small text-ink">
                {notices.map((notice) => <li key={notice} className="break-keep">{notice}</li>)}
            </ul>
        </section>
    );
}

/** 요약 줄의 'n개 반 [바꾸기]'. 눌러서 여는 작은 상자에서 학급 수를 고칩니다. */
function ClassCountControl() {
    const classCount = useClasszleStore((state) => state.settings.classCount);
    const setClassCount = useClasszleStore((state) => state.setClassCount);
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const num = parseInt(value);
    const valid = !isNaN(num) && num >= 2 && num <= 20;
    const apply = () => {
        if (!valid) return;
        setClassCount(num);
        setOpen(false);
    };
    return (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span data-class-count>{classCount}개 반</span>
            <Popover
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    if (next) setValue(String(classCount));
                }}
            >
                <PopoverTrigger asChild>
                    <button type="button" className="cursor-pointer rounded-input px-1 text-small font-semibold text-accent hover:text-accent-ink hover:underline focus-visible:outline-2">
                        바꾸기
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] space-y-2">
                    <label htmlFor="class-count" className="block font-semibold text-ink">편성할 학급 수</label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="class-count"
                            type="number"
                            min={2}
                            max={20}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && apply()}
                            className="h-8 w-20"
                            autoFocus
                        />
                        <span className="text-soft">개 반</span>
                        <Button size="sm" className="ml-auto" onClick={apply} disabled={!valid}>확인</Button>
                    </div>
                    <p className="text-caption text-soft">새 학년도에 만들 반의 수입니다. 2~20개 반까지 됩니다.</p>
                </PopoverContent>
            </Popover>
        </span>
    );
}

const Dot = () => <span className="text-hairline" aria-hidden="true">·</span>;

export default function Step1Setup() {
    const {
        students, setStudents, setClassCount, resetAll,
        updateStudent, deleteStudent, clearMovements, setGroups,
        notices, setNotices, sourceName, setSourceName,
    } = useClasszleStore();
    const confirm = useConfirm();
    const [isDragging, setIsDragging] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedTab, setSelectedTab] = useState('all');
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [onlyWithBehavior, setOnlyWithBehavior] = useState(false);

    // 반이 정해진 학생이 있을 때(양식 B나 배정한 뒤)만 배정반 칸을 둡니다.
    const showAssigned = useMemo(() => students.some((s) => s.assigned_class), [students]);

    const filteredStudents = useMemo(() => {
        let filtered = students.filter((s) => s.name.includes(searchTerm) || s.prev_info.includes(searchTerm));
        if (selectedTab !== 'all') {
            // 전학년도 반 (예: "3학년2반" -> prev_info "3-2-X")
            const match = selectedTab.match(/(\d+)학년(\d+)반/);
            if (match) {
                filtered = filtered.filter((s) => {
                    const parts = s.prev_info.split('-');
                    return parts[0] === match[1] && parts[1] === match[2];
                });
            }
        }
        if (onlyWithBehavior) filtered = filtered.filter((s) => s.behavior_type !== 'NONE');
        return filtered.sort((a, b) => a.prev_info.localeCompare(b.prev_info, undefined, { numeric: true }));
    }, [students, searchTerm, selectedTab, onlyWithBehavior]);

    // 줄을 memo로 두므로 함수가 바뀌지 않아야 바뀐 줄만 다시 그립니다.
    const handleBehaviorChange = useCallback(
        (id: string, type: BehaviorType, score: number) => updateStudent(id, { behavior_type: type, behavior_score: score }),
        [updateStudent],
    );

    const handleDeleteStudent = useCallback(async (id: string) => {
        const state = useClasszleStore.getState();
        const student = state.students.find((s) => s.id === id);
        if (!student) return;
        const consequences = removalConsequences(student, state.students, state.groups);
        const confirmed = await confirm({
            title: `${student.name} 학생을 지울까요?`,
            description: `${consequences.length > 0 ? `함께 지워지는 것: ${consequences.join(', ')}. ` : ''}지운 학생은 되돌릴 수 없습니다.`,
            confirmLabel: '삭제',
            danger: true,
        });
        if (confirmed) deleteStudent(id);
    }, [confirm, deleteStudent]);

    // 전학년도 반별 인원과 생활지도 입력 인원. 빠뜨린 반을 알아채는 데 씁니다.
    const prevClassSummary = useMemo(() => {
        const map = new Map<string, { grade: string; classNum: string; count: number; withBehavior: number }>();
        students.forEach((s) => {
            const parts = s.prev_info.split('-');
            if (parts.length < 2) return;
            const key = `${parts[0]}-${parts[1]}`;
            if (!map.has(key)) map.set(key, { grade: parts[0], classNum: parts[1], count: 0, withBehavior: 0 });
            const item = map.get(key)!;
            item.count++;
            if (s.behavior_type !== 'NONE') item.withBehavior++;
        });
        return [...map.values()].sort(
            (a, b) => parseInt(a.grade) - parseInt(b.grade) || parseInt(a.classNum) - parseInt(b.classNum),
        );
    }, [students]);
    const totalWithBehavior = students.filter((s) => s.behavior_type !== 'NONE').length;
    const classesWithoutBehavior = prevClassSummary.filter((item) => item.withBehavior === 0);
    const oneGrade = new Set(prevClassSummary.map((item) => item.grade)).size <= 1;
    const maleCount = students.filter((s) => s.gender === 'M').length;
    const femaleCount = students.filter((s) => s.gender === 'F').length;
    const average = students.length > 0 ? Math.round(students.reduce((sum, s) => sum + s.academic_score, 0) / students.length) : 0;

    const handleResetAll = async () => {
        const confirmed = await confirm({
            title: '모든 내용을 지우고 처음으로 돌아갈까요?',
            description: '저장하지 않은 내용은 모두 사라집니다.',
            confirmLabel: '전체 초기화',
            danger: true,
        });
        if (confirmed) {
            resetAll();
            setErrorMessage('');
            setSelectedTab('all');
        }
    };

    const handleFileUpload = useCallback(async (file: File) => {
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            setErrorMessage('엑셀 파일(.xlsx, .xls)만 넣을 수 있습니다.');
            return;
        }

        try {
            // 읽을 수 없는 파일이면 묻지 않고 알립니다. 지금 작업은 그대로 둡니다.
            const { students: parsedStudents, warnings, formLine } = await parseExcelFile(file);

            // 지금 작업을 새 명단으로 덮어쓰기 전에 묻습니다.
            if (useClasszleStore.getState().students.length > 0) {
                const confirmed = await confirm({
                    title: '새 파일로 바꿀까요?',
                    description: '지금 작업 중인 학생, 그룹, 배정, 변경 이력이 새 파일 내용으로 바뀝니다. 저장하지 않은 내용은 사라집니다.',
                    confirmLabel: '바꾸기',
                    danger: true,
                });
                if (!confirmed) return;
            }

            setStudents(parsedStudents);
            setSourceName(file.name);
            setGroups([]); // 새 파일을 넣으면 그룹을 비웁니다.
            clearMovements(); // 새 파일을 넣으면 이력을 비웁니다.
            setSelectedTab('all');

            // 학급 수: 반이 정해진 학생이 있으면 그 반에서, 없으면 전학년도 반에서 찾습니다.
            let detectedClassCount = 0;
            const assignedClasses = parsedStudents
                .map((s) => s.assigned_class)
                .filter(Boolean)
                .map((c) => parseInt((c as string).replace(/[^0-9]/g, '')) || 0);
            if (assignedClasses.length > 0) detectedClassCount = Math.max(...assignedClasses);
            if (detectedClassCount === 0) {
                const prevClasses = parsedStudents.map((s) => {
                    const parts = s.prev_info.split('-');
                    return parts.length > 1 ? parseInt(parts[1]) || 0 : 0;
                });
                if (prevClasses.length > 0) detectedClassCount = Math.max(...prevClasses);
            }

            // 학급 수를 바꾼 일은 알림 대신 불러온 뒤 안내와 요약 줄에 남깁니다. 2~20개 반만 받습니다.
            const classLine: string[] = [];
            if (detectedClassCount >= 2 && detectedClassCount <= 20) {
                classLine.push(`파일에 맞춰 학급 수를 ${detectedClassCount}개로 정했습니다. 새 학년도 학급 수와 다르면 맨 위 요약 줄의 바꾸기를 눌러 고쳐 주세요.`);
                setClassCount(detectedClassCount);
            }
            setNotices([formLine, ...classLine, ...warnings]);
            setErrorMessage('');
        } catch (error) {
            setErrorMessage((error as Error).message);
        }
    }, [setStudents, setSourceName, setClassCount, clearMovements, setGroups, setNotices, confirm]);

    const dropHandlers = {
        onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(true);
        },
        onDragLeave: (e: React.DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFileUpload(file);
        },
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // 오류나 취소 뒤에 같은 파일을 다시 고를 수 있게 비웁니다.
        e.target.value = '';
        if (file) handleFileUpload(file);
    };

    const fileInput = <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" id="file-upload" />;
    const linkButton = 'cursor-pointer rounded-input text-small font-medium text-accent underline-offset-2 hover:text-accent-ink hover:underline focus-visible:outline-2';
    const dialogs = (
        <>
            <ExcelGuideDialog open={isGuideOpen} onOpenChange={setIsGuideOpen} />
            <AddStudentDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
        </>
    );

    // ---- 파일을 넣기 전: 파일 상자 하나와 양식 링크 ----
    if (students.length === 0) {
        return (
            <div className="flex flex-col gap-3">
                {fileInput}
                <NoticesLine notices={notices} onClose={() => setNotices([])} />
                <section className="rounded-card bg-card p-5 shadow-card">
                    <h2 className="text-title-sm font-bold text-ink">학생 명단 넣기</h2>
                    <p className="mt-0.5 mb-4 text-small text-soft">양식에 학생 명단을 붙여 넣은 엑셀 파일 하나를 넣습니다.</p>
                    <div
                        data-drop-zone
                        {...dropHandlers}
                        className={`flex h-[140px] flex-col items-center justify-center gap-2 rounded-window border-2 border-dashed text-center transition-colors ${
                            errorMessage
                                ? 'border-danger bg-danger-wash'
                                : isDragging
                                    ? 'border-accent bg-wash'
                                    : 'border-hairline hover:border-ring hover:bg-surface-hover'
                        }`}
                    >
                        <p className="flex items-center gap-2 text-body font-medium text-ink">
                            <UploadSimple size={20} className="text-accent" aria-hidden="true" />
                            엑셀 파일을 여기에 끌어 놓거나
                        </p>
                        <label htmlFor="file-upload">
                            <Button asChild variant="outline" size="sm">
                                <span>파일 고르기</span>
                            </Button>
                        </label>
                        {errorMessage && <p role="alert" className="text-caption text-danger">{errorMessage}</p>}
                    </div>
                    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-soft">
                        <span>양식 받기:</span>
                        <button type="button" className={linkButton} onClick={downloadSampleExcel}>새로 편성할 때</button>
                        <Dot />
                        <button type="button" className={linkButton} onClick={downloadPreAssignedSampleExcel}>편성한 안을 고칠 때</button>
                        <span className="mx-2 h-3 w-px bg-line" aria-hidden="true" />
                        <button type="button" className={`${linkButton} inline-flex items-center gap-1`} onClick={() => setIsGuideOpen(true)}>
                            작성 방법
                            <Question size={15} weight="bold" aria-hidden="true" />
                        </button>
                    </p>
                </section>
                {dialogs}
            </div>
        );
    }

    // ---- 파일을 넣은 뒤: 요약 줄, 안내 한 줄, 학생 표 ----
    return (
        <div data-drop-zone {...dropHandlers} className="relative flex h-full min-h-[420px] flex-col gap-3">
            {fileInput}
            {isDragging && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-window border-2 border-dashed border-accent bg-wash/90 text-body font-semibold text-accent-ink">
                    놓으면 이 파일로 명단을 바꿉니다
                </div>
            )}

            <section data-roster-summary aria-label="명단 요약" className="flex h-12 shrink-0 items-center gap-2.5 rounded-card bg-card pr-2 pl-4 text-body shadow-card">
                <FileXls size={20} className="shrink-0 text-accent" aria-hidden="true" />
                <span className="max-w-[320px] truncate font-semibold text-ink" title={sourceName ?? undefined}>{sourceName ?? '학생 명단'}</span>
                <Dot />
                <span className="whitespace-nowrap">
                    {students.length}명 <span className="text-soft">(남 {maleCount} · 여 {femaleCount})</span>
                </span>
                <Dot />
                <span className="whitespace-nowrap">평균 {average}</span>
                <Dot />
                <ClassCountControl />
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    <label htmlFor="file-upload">
                        <Button asChild variant="outline" size="sm">
                            <span>다른 파일</span>
                        </Button>
                    </label>
                    <MoreMenu label="기초 정보 메뉴">
                        <MoreMenuLabel>양식 받기</MoreMenuLabel>
                        <MoreMenuItem onSelect={downloadSampleExcel}>
                            <DownloadSimple aria-hidden="true" />새로 편성할 때 (양식 A)
                        </MoreMenuItem>
                        <MoreMenuItem onSelect={downloadPreAssignedSampleExcel}>
                            <DownloadSimple aria-hidden="true" />편성한 안을 고칠 때 (양식 B)
                        </MoreMenuItem>
                        <MoreMenuItem onSelect={() => setIsGuideOpen(true)}>
                            <Question aria-hidden="true" />작성 방법
                        </MoreMenuItem>
                        <MoreMenuSeparator />
                        <MoreMenuItem danger onSelect={handleResetAll}>
                            <Trash aria-hidden="true" />전체 초기화
                        </MoreMenuItem>
                    </MoreMenu>
                </div>
            </section>

            {errorMessage && (
                <p role="alert" className="flex shrink-0 items-center gap-2 rounded-card border border-danger bg-danger-wash px-4 py-2 text-small text-ink">
                    <WarningCircle size={16} className="shrink-0 text-danger" aria-hidden="true" />
                    <span className="flex-1">파일을 넣지 못했습니다. {errorMessage}</span>
                    <button type="button" aria-label="닫기" onClick={() => setErrorMessage('')} className="cursor-pointer rounded-input p-1 text-soft hover:bg-card hover:text-ink">
                        <X size={14} aria-hidden="true" />
                    </button>
                </p>
            )}

            <NoticesLine notices={notices} onClose={() => setNotices([])} />

            <section aria-label="학생 표" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card bg-card shadow-card">
                <div data-step1-toolbar className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line px-3 py-2">
                    <Tabs value={selectedTab} onValueChange={setSelectedTab}>
                        <TabsList aria-label="전학년도 반" className="h-8 flex-wrap">
                            <TabsTrigger value="all" aria-label={`전체 ${students.length}명`} className="h-[26px] flex-none px-1.5 text-small">
                                전체
                            </TabsTrigger>
                            {prevClassSummary.map(({ grade, classNum, count, withBehavior }) => {
                                const tabValue = `${grade}학년${classNum}반`;
                                const label = oneGrade ? `${classNum}반` : `${grade}-${classNum}`;
                                const tone = withBehavior > 0 ? 'text-accent-ink' : totalWithBehavior > 0 ? 'text-danger' : 'text-soft';
                                return (
                                    <TabsTrigger
                                        key={tabValue}
                                        value={tabValue}
                                        aria-label={`${label} ${count}명, 생활지도 ${withBehavior}명`}
                                        className="h-[26px] flex-none gap-0.5 px-1.5 text-small"
                                    >
                                        {label}
                                        <span className={`text-micro font-normal tabular-nums ${tone}`}>{withBehavior}</span>
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>
                    </Tabs>
                    <div className="relative w-[124px]">
                        <MagnifyingGlass size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-soft" aria-hidden="true" />
                        <Input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="이름 찾기"
                            aria-label="이름 찾기"
                            className="h-8 pl-8 text-small"
                        />
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 text-small whitespace-nowrap text-ink">
                        <Switch checked={onlyWithBehavior} onCheckedChange={setOnlyWithBehavior} aria-label="생활지도 있는 학생만" />
                        생활지도 있는 학생만
                    </label>
                    <span data-behavior-total className="text-small whitespace-nowrap text-soft">
                        생활지도 <strong className="font-semibold text-ink">{totalWithBehavior}</strong>/{students.length}
                    </span>
                    {totalWithBehavior > 0 && classesWithoutBehavior.length > 0 && (
                        <span className="flex items-center gap-1 text-small whitespace-nowrap text-danger" data-behavior-missing>
                            <WarningCircle size={14} aria-hidden="true" />
                            {classesWithoutBehavior.length <= 3
                                ? `빈 반: ${classesWithoutBehavior.map((item) => `${item.classNum}반`).join(', ')}`
                                : <>빈 반 {classesWithoutBehavior.length}개<span className="sr-only">: {classesWithoutBehavior.map((item) => `${item.classNum}반`).join(', ')}</span></>}
                        </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        <ClassSheetMenu />
                        <Button variant="outline" size="sm" onClick={() => setIsAddDialogOpen(true)}>
                            <Plus aria-hidden="true" />학생 추가
                        </Button>
                    </div>
                </div>

                {/* 표 안에서만 스크롤하고 머리글은 위에 붙습니다. */}
                <div className="min-h-0 flex-1 overflow-auto" data-student-table>
                    <table className="w-full border-collapse text-body">
                        <thead className="sticky top-0 z-[1]">
                            <tr>
                                <th className={`${TH} w-[56px]`}>#</th>
                                <th className={TH}>이름</th>
                                <th className={TH}>이전 학년도</th>
                                <th className={TH}>성별</th>
                                <th className={TH}>성적</th>
                                <th className={TH}>
                                    <span className="relative inline-flex">
                                        <BehaviorPickerHeader />
                                        <span className="absolute top-1/2 -right-7 -translate-y-1/2">
                                            <HelpTip label="생활지도 기준과 키보드" width={340}>
                                                <GuidanceCriteria />
                                                <div className="border-t border-line pt-2">
                                                    <KeyboardHint />
                                                </div>
                                            </HelpTip>
                                        </span>
                                    </span>
                                </th>
                                {showAssigned && <th className={TH}>배정반</th>}
                                <th className={`${TH} w-[80px]`}><span className="sr-only">수정, 삭제</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.map((student, index) => (
                                <StudentTableRow
                                    key={student.id}
                                    student={student}
                                    index={index}
                                    isEditing={editingId === student.id}
                                    showAssigned={showAssigned}
                                    onEditingChange={setEditingId}
                                    onUpdate={updateStudent}
                                    onBehaviorChange={handleBehaviorChange}
                                    onDelete={handleDeleteStudent}
                                />
                            ))}
                            {filteredStudents.length === 0 && (
                                <tr>
                                    <td colSpan={showAssigned ? 8 : 7} className="py-10 text-center text-small text-soft">찾는 학생이 없습니다.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
            {dialogs}
        </div>
    );
}
