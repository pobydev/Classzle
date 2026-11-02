'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { useClasszleStore } from '@/lib/store';
import { parseExcelFile, downloadSampleExcel, downloadPreAssignedSampleExcel } from '@/lib/excel';
import { Student, BehaviorType, Gender } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    ArrowRight,
    ChartBar,
    CheckCircle,
    CircleNotch,
    ClipboardText,
    DownloadSimple,
    Minus,
    NotePencil,
    Plus,
    Question,
    Trash,
    UploadSimple,
    WarningCircle,
} from '@phosphor-icons/react';
import { BehaviorIcon } from '@/components/BehaviorChip';
import { Switch } from '@/components/ui/switch';
import { BehaviorPickerHeader, KEY_HINT } from './BehaviorPicker';
import { ClassSheetPanel } from './ClassSheetPanel';
import { StudentTableRow } from './StudentTableRow';
import { useConfirm } from '@/components/shell/ConfirmProvider';
import { removalConsequences } from '@/lib/studentRemoval';
import { BEHAVIOR_CHOICES, scoreFromInput } from '@/lib/studentInput';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
} from '@/components/ui/dialog';

interface Step1SetupProps {
    onNext: () => void;
}

export default function Step1Setup({ onNext }: Step1SetupProps) {
    const {
        students, setStudents, settings, setClassCount, resetAll,
        updateStudent, addStudent, deleteStudent, clearMovements, setGroups,
        notices, setNotices
    } = useClasszleStore();
    const confirm = useConfirm();
    const [isDragging, setIsDragging] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedTab, setSelectedTab] = useState('all');
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [onlyWithBehavior, setOnlyWithBehavior] = useState(false);
    const [newStudent, setNewStudent] = useState<Partial<Student>>({
        name: '',
        prev_info: '',
        gender: 'M',
        academic_score: 500,
        behavior_score: 0,
        behavior_type: 'NONE',
    });

    // 반 이름 목록
    const classNames = useMemo(() => {
        return ['all', ...Array.from({ length: settings.classCount }, (_, i) => `${i + 1}반`)];
    }, [settings.classCount]);

    // 필터링된 학생 목록
    const filteredStudents = useMemo(() => {
        let filtered = students.filter(
            (s) => s.name.includes(searchTerm) || s.prev_info.includes(searchTerm)
        );

        if (selectedTab !== 'all') {
            if (selectedTab === 'unassigned') {
                // 미배정 학생
                filtered = filtered.filter(s => !s.assigned_class);
            } else if (selectedTab.includes('학년') && selectedTab.includes('반')) {
                // 이전반 필터 (예: "3학년2반" -> prev_info가 "3-2-X" 형식)
                const match = selectedTab.match(/(\d+)학년(\d+)반/);
                if (match) {
                    const grade = match[1];
                    const classNum = match[2];
                    filtered = filtered.filter(s => {
                        const parts = s.prev_info.split('-');
                        return parts[0] === grade && parts[1] === classNum;
                    });
                }
            } else {
                // 배정된 반 필터
                filtered = filtered.filter(s => s.assigned_class === selectedTab);
            }
        }

        if (onlyWithBehavior) {
            filtered = filtered.filter((s) => s.behavior_type !== 'NONE');
        }

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
    const totalWithBehavior = prevClassSummary.reduce((sum, item) => sum + item.withBehavior, 0);
    const classesWithoutBehavior = prevClassSummary.filter((item) => item.withBehavior === 0);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            handleFileUpload(acceptedFiles[0]);
        }
    }, []); // handleFileUpload 의존성 제거 (순환 참조 방지 및 호이스팅 활용)

    // 학급 수 입력을 위한 로컬 상태 (즉시 복구 방지)
    const [localClassCount, setLocalClassCount] = useState(settings.classCount.toString());

    // 전역 상태가 변경될 때 로컬 상태 동기화 (예: 프로젝트 불러오기 시)
    useEffect(() => {
        setLocalClassCount(settings.classCount.toString());
    }, [settings.classCount]);

    const handleResetAll = async () => {
        const confirmed = await confirm({
            title: '모든 내용을 지우고 처음으로 돌아갈까요?',
            description: '저장하지 않은 내용은 모두 사라집니다.',
            confirmLabel: '전체 초기화',
            danger: true,
        });

        if (confirmed) {
            resetAll();
            setUploadStatus('idle');
            setErrorMessage('');
        }
    };

    const handleFileUpload = useCallback(async (file: File) => {
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            setUploadStatus('error');
            setErrorMessage('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.');
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
            setNotices([formLine, ...warnings]);
            setGroups([]); // 새 파일 로드 시 그룹 초기화
            clearMovements(); // 새 파일 로드 시 히스토리 초기화

            // 학급 수 자동 감지
            let detectedClassCount = 0;

            // 1. 기배정 반 정보에서 감지 (assigned_class: "1반", "2반" 등)
            const assignedClasses = parsedStudents
                .map(s => s.assigned_class)
                .filter(Boolean)
                .map(c => parseInt((c as string).replace(/[^0-9]/g, '')) || 0);

            if (assignedClasses.length > 0) {
                detectedClassCount = Math.max(...assignedClasses);
            }

            // 2. 기배정이 없으면 이전 반 정보에서 감지 (prev_info: "3-2-15" → 2)
            if (detectedClassCount === 0) {
                const prevClasses = parsedStudents
                    .map(s => {
                        const parts = s.prev_info.split('-');
                        return parts.length > 1 ? parseInt(parts[1]) || 0 : 0;
                    });

                if (prevClasses.length > 0) {
                    detectedClassCount = Math.max(...prevClasses);
                }
            }

            // 최소 2개 반, 최대 20개 반으로 제한
            if (detectedClassCount >= 2 && detectedClassCount <= 20) {
                if (detectedClassCount !== useClasszleStore.getState().settings.classCount) {
                    toast.info(`파일에 맞춰 학급 수를 ${detectedClassCount}개로 바꿨습니다. 다르면 학급 수를 고쳐 주세요.`, { duration: 10000 });
                }
                setClassCount(detectedClassCount);
            }

            setUploadStatus('success');
            setErrorMessage('');
        } catch (error) {
            setUploadStatus('error');
            setErrorMessage((error as Error).message);
        }
    }, [setStudents, setClassCount, clearMovements, setGroups, setNotices, confirm]);


    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFileUpload(file);
        },
        [handleFileUpload]
    );

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            // 오류나 취소 뒤에 같은 파일을 다시 고를 수 있게 비웁니다.
            e.target.value = '';
            if (file) handleFileUpload(file);
        },
        [handleFileUpload]
    );

    const handleAddStudent = () => {
        if (newStudent.name) {
            addStudent({
                name: newStudent.name,
                prev_info: newStudent.prev_info || '',
                gender: (newStudent.gender as Gender) || 'M',
                academic_score: newStudent.academic_score ?? 500,
                behavior_score: newStudent.behavior_score ?? 0,
                behavior_type: (newStudent.behavior_type as BehaviorType) ?? 'NONE',
                behavior_note: '',
                group_ids: [],
                avoid_ids: [],
                keep_ids: [],
                fixed_class: undefined,
                assigned_class: null,
            });
            setNewStudent({
                name: '',
                prev_info: '',
                gender: 'M',
                academic_score: 500,
                behavior_score: 0,
                behavior_type: 'NONE',
            });
            setIsAddDialogOpen(false);
        }
    };

    return (
        <div className="space-y-6">
            {notices.length > 0 && (
                <section data-import-notices aria-label="불러온 뒤 안내" className="rounded-card border border-line bg-card p-4 shadow-card">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="flex items-center gap-1.5 text-body font-bold text-ink">
                            <WarningCircle size={18} className="text-accent" aria-hidden="true" />
                            불러온 뒤 안내
                        </h2>
                        <Button variant="ghost" size="sm" onClick={() => setNotices([])}>닫기</Button>
                    </div>
                    <ul className="mt-2 max-h-60 space-y-1.5 overflow-y-auto text-small text-ink">
                        {notices.map((notice) => <li key={notice} className="break-keep">{notice}</li>)}
                    </ul>
                </section>
            )}

            {/* 상단: 기초 정보 입력 + 통계 */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-title-sm flex items-center gap-2">
                        <NotePencil size={20} className="text-accent" aria-hidden="true" />
                        기초 정보 입력
                    </CardTitle>
                    <CardDescription>
                        학급 수를 설정하고 학생 명단 엑셀 파일을 업로드해 주세요.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* 학급 수 설정 */}
                    <div className="flex items-center gap-4 mb-6 bg-canvas p-4 rounded-card border border-line">
                        <label className="font-medium min-w-[140px] text-ink">편성할 학급 수</label>
                        <Input
                            type="number"
                            min={2}
                            max={20}
                            value={localClassCount}
                            onChange={(e) => {
                                const val = e.target.value;
                                setLocalClassCount(val); // 로컬 상태는 즉시 반영 (비어있는 상태 허용)

                                const num = parseInt(val);
                                if (!isNaN(num) && num >= 2 && num <= 20) {
                                    setClassCount(num); // 유효한 범위일 때만 전역 상태 업데이트
                                }
                            }}
                            onBlur={() => {
                                // 입력을 마쳤을 때 값이 비어있거나 유효하지 않으면 현재 전역 설정값으로 복구
                                if (!localClassCount || parseInt(localClassCount) < 2 || parseInt(localClassCount) > 20) {
                                    setLocalClassCount(settings.classCount.toString());
                                }
                            }}
                            className="w-24"
                        />
                        <span className="text-soft">개 반</span>
                    </div>

                    {/* 엑셀 업로드 영역 */}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* 왼쪽: 업로드 영역 (2/3) */}
                        <div className="lg:col-span-2 space-y-4">

                            {/* 파일 업로드 영역 */}
                            <div
                                className={`
                                    border-2 border-dashed rounded-window p-6 text-center transition-colors h-[280px] flex flex-col items-center justify-center relative
                                    ${isDragging ? 'border-accent bg-wash' : 'border-hairline hover:border-ring hover:bg-surface-hover'}
                                    ${uploadStatus === 'error' ? 'border-danger bg-danger-wash' : ''}
                                    ${uploadStatus === 'success' ? 'border-accent bg-wash' : ''}
                                `}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setIsDragging(true);
                                }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={handleDrop}
                            >
                                {uploadStatus === 'loading' ? (
                                    <div className="space-y-2">
                                        <CircleNotch size={28} className="mx-auto animate-spin text-accent" aria-hidden="true" />
                                        <p className="text-body">파일 처리 중...</p>
                                    </div>
                                ) : uploadStatus === 'success' ? (
                                    <div className="space-y-1">
                                        <CheckCircle size={28} className="mx-auto text-accent" aria-hidden="true" />
                                        <p className="text-accent-ink font-medium text-body">
                                            {students.length}명의 학생 데이터 로드 완료
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <UploadSimple size={28} className="mx-auto text-accent" aria-hidden="true" />
                                        <p className="font-medium text-body">
                                            엑셀 파일을 드래그하거나 클릭
                                        </p>
                                        {uploadStatus === 'error' && (
                                            <p className="text-danger text-caption">{errorMessage}</p>
                                        )}
                                        <input
                                            type="file"
                                            accept=".xlsx,.xls"
                                            onChange={handleFileSelect}
                                            className="hidden"
                                            id="file-upload"
                                        />
                                        <label htmlFor="file-upload">
                                            <Button asChild variant="outline" size="sm">
                                                <span>파일 선택</span>
                                            </Button>
                                        </label>
                                    </div>
                                )}
                            </div>

                            {/* 버튼들 */}
                            <div>
                                <div className="flex gap-2 flex-wrap mb-2">
                                    <Button variant="outline" size="sm" onClick={() => setIsGuideOpen(true)}>
                                        <Question size={16} aria-hidden="true" />
                                        엑셀 작성 가이드
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={downloadSampleExcel}>
                                        <DownloadSimple size={16} aria-hidden="true" />
                                        양식 A (이전학년 명단)
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={downloadPreAssignedSampleExcel}>
                                        <DownloadSimple size={16} aria-hidden="true" />
                                        양식 B (신학년 기배정안)
                                    </Button>
                                    {students.length > 0 && (
                                        <Button variant="destructive" size="sm" onClick={handleResetAll}>
                                            <Trash size={16} aria-hidden="true" />
                                            전체 초기화
                                        </Button>
                                    )}
                                </div>
                                <p className="text-caption text-soft break-keep">
                                    <strong>양식 A</strong>: 새로 반을 편성할 때 (이전 학년도 반/번호 정보만 필요) &nbsp;|&nbsp;
                                    <strong>양식 B</strong>: 기존 배정안을 수정할 때 (신학년 배정 결과 포함) -
                                    둘 중 하나에 학생 정보를 붙여넣고 업로드해 주세요.
                                </p>
                            </div>

                            <ClassSheetPanel />

                            <Dialog open={isGuideOpen} onOpenChange={setIsGuideOpen}>
                                <DialogContent className="sm:max-w-[60vw] max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                            <ChartBar size={20} className="text-accent" aria-hidden="true" />
                                            엑셀 파일 작성 가이드
                                        </DialogTitle>
                                        <DialogDescription>학생 데이터 엑셀 파일 작성 방법을 안내합니다.</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-6 pt-4">
                                        <Tabs defaultValue="form-a" className="w-full">
                                            <TabsList className="grid w-full grid-cols-2 mb-4">
                                                <TabsTrigger value="form-a">양식 A (기본)</TabsTrigger>
                                                <TabsTrigger value="form-b">양식 B (기배정)</TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="form-a" className="space-y-6">
                                                <div className="space-y-2">
                                                    <h3 className="font-semibold text-title-sm flex items-center gap-2">
                                                        <span className="bg-wash text-accent w-6 h-6 rounded-full flex items-center justify-center text-body">1</span>
                                                        필수 열(Column) 구성 (양식 A)
                                                    </h3>
                                                    <p className="text-body text-soft ml-8">
                                                        새로 반 편성을 할 때 사용합니다. 엑셀 헤더에 아래 항목들이 포함되어야 합니다.
                                                    </p>
                                                    <div className="ml-8 border rounded-input overflow-hidden">
                                                        <Table>
                                                            <TableHeader className="bg-canvas">
                                                                <TableRow>
                                                                    <TableHead className="w-24">항목</TableHead>
                                                                    <TableHead>설명 및 예시</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody className="text-body">
                                                                <TableRow>
                                                                    <TableCell className="font-medium">학년/반/번호</TableCell>
                                                                    <TableCell>
                                                                        학생의 이전 학적 정보입니다.<br />
                                                                        <span className="text-soft text-caption">예: 2 (학년), 1 (반), 15 (번호)</span>
                                                                    </TableCell>
                                                                </TableRow>
                                                                <TableRow>
                                                                    <TableCell className="font-medium">이름</TableCell>
                                                                    <TableCell>학생의 성명 (필수)</TableCell>
                                                                </TableRow>
                                                                <TableRow>
                                                                    <TableCell className="font-medium">성별</TableCell>
                                                                    <TableCell>'남', '여', 'M', 'F' 중 입력</TableCell>
                                                                </TableRow>
                                                                <TableRow>
                                                                    <TableCell className="font-medium">성적</TableCell>
                                                                    <TableCell>숫자 형태의 학업 성취도 등급 또는 점수</TableCell>
                                                                </TableRow>
                                                                <TableRow>
                                                                    <TableCell className="font-medium">생활지도</TableCell>
                                                                    <TableCell>
                                                                        학생의 생활지도 특성 (아래 상세 설명 참조)
                                                                    </TableCell>
                                                                </TableRow>
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                </div>
                                            </TabsContent>

                                            <TabsContent value="form-b" className="space-y-6">
                                                <div className="space-y-2">
                                                    <h3 className="font-semibold text-title-sm flex items-center gap-2">
                                                        <span className="bg-wash text-accent w-6 h-6 rounded-full flex items-center justify-center text-body">1</span>
                                                        필수 열(Column) 구성 (양식 B)
                                                    </h3>
                                                    <p className="text-body text-soft ml-8">
                                                        이미 배정된 결과를 초기 데이터로 불러올 때 사용합니다.<br />
                                                        (반 편성 탭에서 <strong>현재 배정 수정</strong>을 선택하여 이어서 작업 가능)
                                                    </p>
                                                    <div className="ml-8 border rounded-input overflow-hidden">
                                                        <Table>
                                                            <TableHeader className="bg-canvas">
                                                                <TableRow>
                                                                    <TableHead className="w-32">항목</TableHead>
                                                                    <TableHead>설명 및 예시</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody className="text-body">
                                                                <TableRow>
                                                                    <TableCell className="font-medium">
                                                                        <span className="text-accent-ink font-bold">배정 학년/반/번호</span>
                                                                        <br />(앞쪽 열)
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <span className="font-semibold text-accent-ink">새로 배정된</span> 정보입니다.<br />
                                                                        <span className="text-soft text-caption">예: 3 (학년), 1 (반), 1 (번호)</span>
                                                                    </TableCell>
                                                                </TableRow>
                                                                <TableRow>
                                                                    <TableCell className="font-medium">
                                                                        <span className="text-soft font-bold">이전 학년/반/번호</span>
                                                                        <br />(뒤쪽 열)
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <span className="font-semibold text-soft">작년(이전)</span> 학적 정보입니다.<br />
                                                                        <span className="text-soft text-caption">예: 2 (학년), 1 (반), 15 (번호)</span>
                                                                    </TableCell>
                                                                </TableRow>
                                                                <TableRow>
                                                                    <TableCell className="font-medium">이름/성별/성적</TableCell>
                                                                    <TableCell>양식 A와 동일합니다.</TableCell>
                                                                </TableRow>
                                                                <TableRow>
                                                                    <TableCell className="font-medium">생활지도</TableCell>
                                                                    <TableCell>양식 A와 동일합니다.</TableCell>
                                                                </TableRow>
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                </div>
                                            </TabsContent>
                                        </Tabs>

                                        <div className="space-y-2 pt-4 border-t">
                                            <h3 className="font-semibold text-title-sm flex items-center gap-2">
                                                <span className="bg-wash text-accent w-6 h-6 rounded-full flex items-center justify-center text-body">2</span>
                                                생활지도 입력 값 (공통 중요)
                                            </h3>
                                            <p className="text-body text-soft ml-8">
                                                '생활지도' 열에는 아래 형식의 텍스트가 정확히 입력되어야 점수가 반영됩니다.
                                            </p>
                                            <div className="ml-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="border rounded-input p-3">
                                                    <span className="font-bold text-ink flex items-center gap-1.5 mb-2"><BehaviorIcon type="LEADER" /> 리더십 (점수 가산)</span>
                                                    <ul className="list-disc list-inside text-body space-y-1 text-soft">
                                                        <li><code className="text-ink font-semibold">리더(+2)</code> : 리더십이 탁월한 학생 (회장감)</li>
                                                        <li><code className="text-ink font-semibold">리더(+1)</code> : 모범적이고 성실한 학생</li>
                                                    </ul>
                                                </div>
                                                <div className="border rounded-input p-3">
                                                    <span className="font-bold text-ink flex items-center gap-1.5 mb-2"><BehaviorIcon type="BEHAVIOR" /> 행동 특성 (점수 차감)</span>
                                                    <ul className="list-disc list-inside text-body space-y-1 text-soft">
                                                        <li><code className="text-ink font-semibold">행동(-3)</code> : 심각한 방해, 학교폭력 등 집중 관리 필요</li>
                                                        <li><code className="text-ink font-semibold">행동(-2)</code> : 잦은 방해, 지속적 지도 필요</li>
                                                        <li><code className="text-ink font-semibold">행동(-1)</code> : 가벼운 딴짓, 관심 필요</li>
                                                    </ul>
                                                </div>
                                                <div className="border rounded-input p-3">
                                                    <span className="font-bold text-ink flex items-center gap-1.5 mb-2"><BehaviorIcon type="EMOTIONAL" /> 정서 특성 (점수 차감)</span>
                                                    <ul className="list-disc list-inside text-body space-y-1 text-soft">
                                                        <li><code className="text-ink font-semibold">정서(-3)</code> : 특별한 케어/전문가 개입 필요</li>
                                                        <li><code className="text-ink font-semibold">정서(-2)</code> : 교우관계/정서 지원 필요</li>
                                                        <li><code className="text-ink font-semibold">정서(-1)</code> : 다소 예민함, 배려 필요</li>
                                                    </ul>
                                                </div>
                                                <div className="border rounded-input p-3">
                                                    <span className="font-bold text-ink flex items-center gap-1.5 mb-2"><Minus size={16} className="text-soft" aria-hidden="true" /> 해당 없음</span>
                                                    <p className="text-body text-soft">
                                                        <code className="text-ink font-semibold">해당없음</code> 또는 빈 칸<br />
                                                        (0점으로 처리됨)
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-2">
                                            <Button onClick={() => setIsGuideOpen(false)}>확인</Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>

                        {/* 오른쪽: 통계 (1/3) */}
                        <div className="grid grid-cols-2 gap-3 content-start">
                            <div className="bg-surface-hover rounded-card p-4 text-center h-[134px] flex flex-col justify-center">
                                <div className="text-title font-bold">{students.length}</div>
                                <div className="text-caption text-soft">전체 학생</div>
                            </div>
                            <div className="bg-surface-hover rounded-card p-4 text-center h-[134px] flex flex-col justify-center">
                                <div className="text-title font-bold">
                                    {students.filter((s) => s.gender === 'M').length}
                                </div>
                                <div className="text-caption text-soft">남학생</div>
                            </div>
                            <div className="bg-surface-hover rounded-card p-4 text-center h-[134px] flex flex-col justify-center">
                                <div className="text-title font-bold">
                                    {students.filter((s) => s.gender === 'F').length}
                                </div>
                                <div className="text-caption text-soft">여학생</div>
                            </div>
                            <div className="bg-surface-hover rounded-card p-4 text-center h-[134px] flex flex-col justify-center">
                                <div className="text-title font-bold">
                                    {students.length > 0
                                        ? Math.round(
                                            students.reduce((sum, s) => sum + s.academic_score, 0) /
                                            students.length
                                        )
                                        : '-'}
                                </div>
                                <div className="text-caption text-soft">평균 성적</div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 학생 관리 테이블 (학생 데이터가 있을 때만) */}
            {
                students.length > 0 && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between flex-wrap gap-4">
                                <CardTitle className="flex items-center gap-2">
                                    <ClipboardText size={20} className="text-accent" aria-hidden="true" />
                                    학생 관리
                                </CardTitle>
                                <div className="flex items-center gap-4">
                                    <Input
                                        placeholder="이름/이전학년 검색..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-48"
                                    />
                                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button size="sm"><Plus size={16} aria-hidden="true" />학생 추가</Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>새 학생 추가</DialogTitle>
                                                <DialogDescription>새 학생의 정보를 입력해 주세요.</DialogDescription>
                                            </DialogHeader>
                                            <div className="grid gap-4 py-4">
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <label className="text-right">이름</label>
                                                    <Input
                                                        className="col-span-3"
                                                        value={newStudent.name}
                                                        onChange={(e) =>
                                                            setNewStudent({ ...newStudent, name: e.target.value })
                                                        }
                                                    />
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <label className="text-right">이전학년</label>
                                                    <Input
                                                        className="col-span-3"
                                                        placeholder="3-2-15"
                                                        value={newStudent.prev_info}
                                                        onChange={(e) =>
                                                            setNewStudent({ ...newStudent, prev_info: e.target.value })
                                                        }
                                                    />
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <label className="text-right">성별</label>
                                                    <Select
                                                        value={newStudent.gender}
                                                        onValueChange={(v) =>
                                                            setNewStudent({ ...newStudent, gender: v as Gender })
                                                        }
                                                    >
                                                        <SelectTrigger className="col-span-3">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="M">남</SelectItem>
                                                            <SelectItem value="F">여</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <label className="text-right">성적</label>
                                                    <Input
                                                        className="col-span-3"
                                                        type="number"
                                                        step="any"
                                                        value={newStudent.academic_score ?? ''}
                                                        onChange={(e) =>
                                                            setNewStudent({
                                                                ...newStudent,
                                                                academic_score: scoreFromInput(e.target.value),
                                                            })
                                                        }
                                                    />
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <label className="text-right">생활지도</label>
                                                    <Select
                                                        value={`${newStudent.behavior_type}:${newStudent.behavior_score}`}
                                                        onValueChange={(v) => {
                                                            const choice = BEHAVIOR_CHOICES.find((c) => c.value === v);
                                                            if (choice) setNewStudent({ ...newStudent, behavior_type: choice.type, behavior_score: choice.score });
                                                        }}
                                                    >
                                                        <SelectTrigger className="col-span-3" aria-label="생활지도">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {BEHAVIOR_CHOICES.map((c) => (
                                                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                                    취소
                                                </Button>
                                                <Button onClick={handleAddStudent}>추가</Button>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {/* 반별 탭 - 배정된 학생이 있는지에 따라 다르게 표시 */}
                            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
                                <TabsList className="flex-wrap h-auto gap-1 mb-4">
                                    <TabsTrigger value="all">
                                        전체 ({students.length})
                                    </TabsTrigger>
                                    {prevClassSummary.map(({ grade, classNum, count, withBehavior }) => {
                                        const tabValue = `${grade}학년${classNum}반`;
                                        return (
                                            <TabsTrigger key={tabValue} value={tabValue} title={`생활지도 입력 ${withBehavior}명`}>
                                                {grade}학년 {classNum}반 ({count})
                                                <span className={`text-caption ${withBehavior > 0 ? 'text-accent-ink' : totalWithBehavior > 0 ? 'text-danger' : 'text-soft'}`}>
                                                    입력 {withBehavior}
                                                </span>
                                            </TabsTrigger>
                                        );
                                    })}
                                </TabsList>

                                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-soft">
                                    <label className="flex items-center gap-2 text-ink">
                                        <Switch checked={onlyWithBehavior} onCheckedChange={setOnlyWithBehavior} aria-label="생활지도 있는 학생만" />
                                        생활지도 있는 학생만
                                    </label>
                                    <span data-behavior-total>생활지도 입력 {totalWithBehavior}명 / 전체 {students.length}명</span>
                                    {totalWithBehavior > 0 && classesWithoutBehavior.length > 0 && (
                                        <span className="flex items-center gap-1 text-danger" data-behavior-missing>
                                            <WarningCircle size={14} aria-hidden="true" />
                                            입력이 없는 반: {classesWithoutBehavior.map((item) => `${item.classNum}반`).join(', ')}
                                        </span>
                                    )}
                                    <span className="basis-full text-caption">{KEY_HINT}</span>
                                </div>

                                <div className="rounded-input border overflow-auto max-h-[500px]">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-canvas">
                                            <TableRow>
                                                <TableHead className="w-[60px] text-center">#</TableHead>
                                                <TableHead className="text-center">이름</TableHead>
                                                <TableHead className="text-center">이전학년</TableHead>
                                                <TableHead className="text-center">성별</TableHead>
                                                <TableHead className="text-center">성적</TableHead>
                                                <TableHead className="text-center">
                                                    <BehaviorPickerHeader />
                                                </TableHead>
                                                <TableHead className="text-center">배정반</TableHead>
                                                <TableHead className="w-[80px] text-center">액션</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredStudents.map((student, index) => (
                                                <StudentTableRow
                                                    key={student.id}
                                                    student={student}
                                                    index={index}
                                                    isEditing={editingId === student.id}
                                                    onEditingChange={setEditingId}
                                                    onUpdate={updateStudent}
                                                    onBehaviorChange={handleBehaviorChange}
                                                    onDelete={handleDeleteStudent}
                                                />
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </Tabs>
                        </CardContent>
                    </Card>
                )
            }

            {/* 다음 단계 버튼 */}
            <div className="flex justify-end mt-8 border-t pt-6">
                <Button
                    size="lg"
                    onClick={onNext}
                    disabled={students.length === 0}
                >
                    다음: 조건 설정
                    <ArrowRight size={16} aria-hidden="true" />
                </Button>
            </div>
        </div >
    );
}
