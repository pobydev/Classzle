'use client';

// 반별 입력표: 담임에게 그 반 파일만 보내고, 돌아온 파일에서 생활지도 값만 받습니다. 쓰지 않아도 됩니다.
// 1단계 도구 줄의 '담임에게 받기' 메뉴입니다. 개인정보 안내는 내보내기 창 안에 둡니다.

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CaretDown, DownloadSimple, ShieldCheck, UploadSimple } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/shell/ConfirmProvider';
import {
    applyBehaviorUpdates,
    buildClassSheetWorkbook,
    classSheetFileName,
    groupByPrevClass,
    planClassSheetImport,
    readClassSheet,
} from '@/lib/classSheets';
import type { ClassSheetFile, ClassSheetPlan } from '@/lib/classSheets';
import { saveWorkbook } from '@/lib/excel';
import { useClasszleStore } from '@/lib/store';

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <span className="block mt-3">
            <strong className="block text-ink">{title}</strong>
            {children}
        </span>
    );
}

function PlanSummary({ plan }: { plan: ClassSheetPlan }) {
    return (
        <span className="block max-h-[50vh] overflow-y-auto" data-class-sheet-summary>
            {plan.classes.map((item) => (
                <span key={item.label} className="block">
                    {item.label} {item.matched}명, 바뀌는 학생 {item.changed}명
                    {item.missing > 0 && `, 파일에 없는 학생 ${item.missing}명`}
                </span>
            ))}
            {plan.classes.length === 0 && <span className="block">맞춘 학생이 없습니다.</span>}
            {plan.duplicateClasses.length > 0 && (
                <Section title="같은 반 파일이 둘 이상이라 반영하지 않습니다">
                    {plan.duplicateClasses.map((item) => (
                        <span key={item.label} className="block">{item.label}: {item.fileNames.join(', ')}</span>
                    ))}
                </Section>
            )}
            {plan.unmatched.length > 0 && (
                <Section title={`못 맞춘 학생 ${plan.unmatched.length}명 (반영하지 않습니다)`}>
                    {plan.unmatched.map((item, index) => (
                        <span key={index} className="block">{item.who}: {item.reason}</span>
                    ))}
                </Section>
            )}
            {plan.unreadable.length > 0 && (
                <Section title={`읽지 못한 값 ${plan.unreadable.length}개 (반영하지 않습니다)`}>
                    {plan.unreadable.map((item, index) => (
                        <span key={index} className="block">{item.who}: {item.value}</span>
                    ))}
                </Section>
            )}
            {plan.invalidFiles.length > 0 && (
                <Section title="읽지 못한 파일">
                    {plan.invalidFiles.map((item) => (
                        <span key={item.fileName} className="block">{item.fileName}: {item.reason}</span>
                    ))}
                </Section>
            )}
        </span>
    );
}

export function ClassSheetMenu() {
    const students = useClasszleStore((state) => state.students);
    const confirm = useConfirm();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);

    const exportSheets = async () => {
        const { groups, skipped } = groupByPrevClass(students);
        if (groups.length === 0) {
            toast.error('전학년도 반을 알 수 있는 학생이 없습니다.');
            return;
        }
        setIsBusy(true);
        try {
            const api = window.electronAPI;
            if (api) {
                const files = await Promise.all(
                    groups.map(async (group) => ({
                        name: classSheetFileName(group),
                        data: new Uint8Array((await buildClassSheetWorkbook(group).xlsx.writeBuffer()) as ArrayBuffer),
                    })),
                );
                let result = await api.saveClassSheets(files);
                if (result.status === 'canceled') return;
                if (result.status === 'exists') {
                    const overwrite = await confirm({
                        title: '같은 이름의 입력표가 이미 있습니다.',
                        description: `파일 ${result.existing.length}개를 새 입력표로 덮어씁니다. 담임이 채운 파일이라면 내용이 사라집니다.`,
                        confirmLabel: '덮어쓰기',
                        danger: true,
                    });
                    if (!overwrite) return;
                    result = await api.saveClassSheets(files, result.folder);
                }
                if (result.status === 'locked') {
                    toast.error('입력표 파일이 다른 프로그램에서 열려 있어 저장하지 못했습니다. 엑셀을 닫고 다시 저장해 주세요.');
                    return;
                }
                if (result.status === 'failed') {
                    toast.error('입력표를 저장하지 못했습니다.');
                    return;
                }
            } else {
                for (const group of groups) {
                    await saveWorkbook(buildClassSheetWorkbook(group), classSheetFileName(group));
                }
            }
            toast.success(`입력표 ${groups.length}개를 저장했습니다.`);
            if (skipped.length > 0) {
                toast.warning(`전학년도 반을 알 수 없어 넣지 않은 학생이 ${skipped.length}명 있습니다.`, { duration: 12000 });
            }
        } catch (e) {
            console.error(e);
            toast.error('입력표를 만들지 못했습니다.');
        } finally {
            setIsBusy(false);
        }
    };

    const importSheets = async (fileList: FileList) => {
        setIsBusy(true);
        try {
            const files: ClassSheetFile[] = [];
            const broken: string[] = [];
            for (const file of Array.from(fileList)) {
                try {
                    files.push(readClassSheet(file.name, await file.arrayBuffer()));
                } catch (e) {
                    console.error(e);
                    broken.push(file.name);
                }
            }
            // 확인하는 동안 명단이 바뀌지 않으므로 지금 명단으로 계산합니다.
            const plan = planClassSheetImport(useClasszleStore.getState().students, files);
            broken.forEach((fileName) => plan.invalidFiles.push({ fileName, reason: '엑셀 파일로 읽지 못했습니다.' }));

            const answer = await confirm({
                title: plan.updates.length > 0 ? `생활지도 ${plan.updates.length}명을 반영할까요?` : '반영할 값이 없습니다.',
                description: <PlanSummary plan={plan} />,
                confirmLabel: plan.updates.length > 0 ? '반영' : '확인',
            });
            if (!answer || plan.updates.length === 0) return;
            const store = useClasszleStore.getState();
            store.applyGuidance(applyBehaviorUpdates(store.students, plan.updates));
            toast.success(`생활지도 ${plan.updates.length}명을 반영했습니다.`);
        } finally {
            setIsBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    if (students.length === 0) return null;

    return (
        <>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={isBusy} data-class-sheet-menu>
                        담임에게 받기
                        <CaretDown aria-hidden="true" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setIsExportOpen(true)}>
                        <DownloadSimple aria-hidden="true" />반별 입력표 내보내기
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
                        <UploadSimple aria-hidden="true" />입력표 받기
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <input
                ref={inputRef}
                type="file"
                multiple
                accept=".xlsx,.xls"
                className="hidden"
                data-class-sheet-input
                onChange={(e) => e.target.files && e.target.files.length > 0 && importSheets(e.target.files)}
            />
            <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>반별 입력표 내보내기</DialogTitle>
                        <DialogDescription>
                            전학년도 반마다 엑셀 파일을 하나씩 만듭니다. 담임 선생님이 생활지도 칸을 채워 돌려주면 입력표 받기로 넣습니다.
                        </DialogDescription>
                    </DialogHeader>
                    <p className="flex gap-2 rounded-button bg-wash p-3 text-small text-accent-ink" data-class-sheet-privacy>
                        <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span>
                            파일에는 그 반 학생의 번호, 이름, 성별만 들어갑니다. 암호는 걸리지 않으니 학교 메신저처럼 정해진 경로로 주고받고, 끝나면 파일을 지워 주세요.
                        </span>
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsExportOpen(false)}>취소</Button>
                        <Button
                            onClick={() => {
                                setIsExportOpen(false);
                                void exportSheets();
                            }}
                        >
                            <DownloadSimple aria-hidden="true" />내보내기
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
