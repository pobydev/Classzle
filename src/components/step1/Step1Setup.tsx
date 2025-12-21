'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
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
import { PencilSimple, Trash } from '@phosphor-icons/react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

interface Step1SetupProps {
    onNext: () => void;
}

export default function Step1Setup({ onNext }: Step1SetupProps) {
    const {
        students, setStudents, settings, setClassCount, resetAll,
        updateStudent, addStudent, deleteStudent
    } = useClasszleStore();
    const [isDragging, setIsDragging] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedTab, setSelectedTab] = useState('all');
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [newStudent, setNewStudent] = useState<Partial<Student>>({
        name: '',
        prev_info: '',
        gender: 'M',
        academic_score: 500,
        behavior_score: 0,
        behavior_type: 'NONE',
    });

    // 학급 수 입력을 위한 로컬 상태 (즉시 복구 방지)
    const [localClassCount, setLocalClassCount] = useState(settings.classCount.toString());

    // 전역 상태가 변경될 때 로컬 상태 동기화 (예: 프로젝트 불러오기 시)
    useEffect(() => {
        setLocalClassCount(settings.classCount.toString());
    }, [settings.classCount]);

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

        return filtered.sort((a, b) => a.prev_info.localeCompare(b.prev_info, undefined, { numeric: true }));
    }, [students, searchTerm, selectedTab]);

    const handleResetAll = () => {
        if (window.confirm('정말 모든 데이터를 삭제하고 초기화하시겠습니까?\n저장하지 않은 진행 상황은 모두 사라집니다.')) {
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

        setUploadStatus('loading');
        try {
            const parsedStudents = await parseExcelFile(file);
            setStudents(parsedStudents);

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
                setClassCount(detectedClassCount);
            }

            setUploadStatus('success');
            setErrorMessage('');
        } catch (error) {
            setUploadStatus('error');
            setErrorMessage((error as Error).message);
        }
    }, [setStudents, setClassCount]);


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
                academic_score: newStudent.academic_score || 500,
                behavior_score: newStudent.behavior_score || 0,
                behavior_type: (newStudent.behavior_type as BehaviorType) || 'NONE',
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

    const getBehaviorColor = (type: BehaviorType, score: number) => {
        if (type === 'NONE') return '';
        if (type === 'LEADER') {
            // 리더: 양수 점수 (1, 2)
            if (score >= 2) return 'bg-green-200'; // 강한 리더
            return 'bg-green-100'; // 일반 리더
        }
        if (type === 'BEHAVIOR') {
            // 행동: 음수 점수 (-1, -2, -3)
            // 점수가 낮을수록(절대값이 클수록) 진한 색
            if (score <= -3) return 'bg-orange-300';
            if (score <= -2) return 'bg-orange-200';
            return 'bg-orange-100';
        }
        if (type === 'EMOTIONAL') {
            // 정서: 음수 점수 (-1, -2, -3)
            if (score <= -3) return 'bg-blue-300';
            if (score <= -2) return 'bg-blue-200';
            return 'bg-blue-100';
        }
        return '';
    };

    return (
        <div className="space-y-6">
            {/* 상단: 기초 정보 입력 + 통계 */}
            <Card className="rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/80 backdrop-blur">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        📝 기초 정보 입력
                    </CardTitle>
                    <CardDescription>
                        학급 수를 설정하고 학생 명단 엑셀 파일을 업로드하세요.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* 학급 수 설정 */}
                    <div className="flex items-center gap-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <label className="font-medium min-w-[140px] text-slate-700">편성할 학급 수</label>
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
                            className="w-24 bg-white border-slate-200 focus-visible:ring-indigo-500 rounded-lg"
                        />
                        <span className="text-muted-foreground">개 반</span>
                    </div>

                    {/* 엑셀 업로드 영역 */}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* 왼쪽: 업로드 영역 (2/3) */}
                        <div className="lg:col-span-2 space-y-4">

                            {/* 파일 업로드 영역 */}
                            <div
                                className={`
                                    border-2 border-dashed rounded-xl p-6 text-center transition-all h-[280px] flex flex-col items-center justify-center relative
                                    ${isDragging ? 'border-indigo-500 bg-indigo-50/50 scale-[1.02]' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'}
                                    ${uploadStatus === 'error' ? 'border-red-400 bg-red-50/30' : ''}
                                    ${uploadStatus === 'success' ? 'border-emerald-400 bg-emerald-50/30' : ''}
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
                                        <div className="animate-spin text-2xl">⏳</div>
                                        <p className="text-sm">파일 처리 중...</p>
                                    </div>
                                ) : uploadStatus === 'success' ? (
                                    <div className="space-y-1">
                                        <div className="text-2xl">✅</div>
                                        <p className="text-green-600 font-medium text-sm">
                                            {students.length}명의 학생 데이터 로드 완료
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="text-2xl">📤</div>
                                        <p className="font-medium text-sm">
                                            엑셀 파일을 드래그하거나 클릭
                                        </p>
                                        {uploadStatus === 'error' && (
                                            <p className="text-destructive text-xs">{errorMessage}</p>
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
                                        ❓ 엑셀 작성 가이드
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={downloadSampleExcel}>
                                        📥 양식 A (이전학년 명단)
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={downloadPreAssignedSampleExcel}>
                                        📥 양식 B (신학년 기배정안)
                                    </Button>
                                    {students.length > 0 && (
                                        <Button variant="destructive" size="sm" onClick={handleResetAll}>
                                            🗑️ 전체 초기화
                                        </Button>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground break-keep">
                                    <strong>양식 A</strong>: 새로 반을 편성할 때 (이전 학년도 반/번호 정보만 필요) &nbsp;|&nbsp;
                                    <strong>양식 B</strong>: 기존 배정안을 수정할 때 (신학년 배정 결과 포함) -
                                    둘 중 하나에 학생 정보를 붙여넣고 업로드하세요.
                                </p>
                            </div>

                            <Dialog open={isGuideOpen} onOpenChange={setIsGuideOpen}>
                                <DialogContent className="sm:max-w-[60vw] max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle>📊 엑셀 파일 작성 가이드</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-6 pt-4">
                                        <Tabs defaultValue="form-a" className="w-full">
                                            <TabsList className="grid w-full grid-cols-2 mb-4">
                                                <TabsTrigger value="form-a">양식 A (기본)</TabsTrigger>
                                                <TabsTrigger value="form-b">양식 B (기배정)</TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="form-a" className="space-y-6">
                                                <div className="space-y-2">
                                                    <h3 className="font-semibold text-lg flex items-center gap-2">
                                                        <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                                                        필수 열(Column) 구성 (양식 A)
                                                    </h3>
                                                    <p className="text-sm text-muted-foreground ml-8">
                                                        새로 반 편성을 할 때 사용합니다. 엑셀 헤더에 아래 항목들이 포함되어야 합니다.
                                                    </p>
                                                    <div className="ml-8 border rounded-md overflow-hidden">
                                                        <Table>
                                                            <TableHeader className="bg-muted/50">
                                                                <TableRow>
                                                                    <TableHead className="w-24">항목</TableHead>
                                                                    <TableHead>설명 및 예시</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody className="text-sm">
                                                                <TableRow>
                                                                    <TableCell className="font-medium">학년/반/번호</TableCell>
                                                                    <TableCell>
                                                                        학생의 이전 학적 정보입니다.<br />
                                                                        <span className="text-muted-foreground text-xs">예: 2 (학년), 1 (반), 15 (번호)</span>
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
                                                    <h3 className="font-semibold text-lg flex items-center gap-2">
                                                        <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                                                        필수 열(Column) 구성 (양식 B)
                                                    </h3>
                                                    <p className="text-sm text-muted-foreground ml-8">
                                                        이미 배정된 결과를 초기 데이터로 불러올 때 사용합니다.<br />
                                                        (반 편성 탭에서 <strong>기존 배정 유지</strong>를 선택하여 이어서 작업 가능)
                                                    </p>
                                                    <div className="ml-8 border rounded-md overflow-hidden">
                                                        <Table>
                                                            <TableHeader className="bg-muted/50">
                                                                <TableRow>
                                                                    <TableHead className="w-32">항목</TableHead>
                                                                    <TableHead>설명 및 예시</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody className="text-sm">
                                                                <TableRow>
                                                                    <TableCell className="font-medium">
                                                                        <span className="text-indigo-600 font-bold">배정 학년/반/번호</span>
                                                                        <br />(앞쪽 열)
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <span className="font-semibold text-indigo-600">새로 배정된</span> 정보입니다.<br />
                                                                        <span className="text-muted-foreground text-xs">예: 3 (학년), 1 (반), 1 (번호)</span>
                                                                    </TableCell>
                                                                </TableRow>
                                                                <TableRow>
                                                                    <TableCell className="font-medium">
                                                                        <span className="text-slate-500 font-bold">이전 학년/반/번호</span>
                                                                        <br />(뒤쪽 열)
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <span className="font-semibold text-slate-500">작년(이전)</span> 학적 정보입니다.<br />
                                                                        <span className="text-muted-foreground text-xs">예: 2 (학년), 1 (반), 15 (번호)</span>
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
                                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                                <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                                                생활지도 입력 값 (공통 중요)
                                            </h3>
                                            <p className="text-sm text-muted-foreground ml-8">
                                                '생활지도' 열에는 아래 형식의 텍스트가 정확히 입력되어야 점수가 반영됩니다.
                                            </p>
                                            <div className="ml-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="border rounded-md p-3 bg-green-50/50 border-green-100">
                                                    <span className="font-bold text-green-700 block mb-2">🟢 리더십 (점수 가산)</span>
                                                    <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                                                        <li><code className="text-foreground font-semibold">리더(+2)</code> : 리더십이 탁월한 학생 (회장감)</li>
                                                        <li><code className="text-foreground font-semibold">리더(+1)</code> : 모범적이고 성실한 학생</li>
                                                    </ul>
                                                </div>
                                                <div className="border rounded-md p-3 bg-red-50/50 border-red-100">
                                                    <span className="font-bold text-red-700 block mb-2">🔴 행동 특성 (점수 차감)</span>
                                                    <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                                                        <li><code className="text-foreground font-semibold">행동(-3)</code> : 심각한 방해, 학교폭력 등 집중 관리 필요</li>
                                                        <li><code className="text-foreground font-semibold">행동(-2)</code> : 잦은 방해, 지속적 지도 필요</li>
                                                        <li><code className="text-foreground font-semibold">행동(-1)</code> : 가벼운 딴짓, 관심 필요</li>
                                                    </ul>
                                                </div>
                                                <div className="border rounded-md p-3 bg-blue-50/50 border-blue-100">
                                                    <span className="font-bold text-blue-700 block mb-2">🔵 정서 특성 (점수 차감)</span>
                                                    <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                                                        <li><code className="text-foreground font-semibold">정서(-3)</code> : 특별한 케어/전문가 개입 필요</li>
                                                        <li><code className="text-foreground font-semibold">정서(-2)</code> : 교우관계/정서 지원 필요</li>
                                                        <li><code className="text-foreground font-semibold">정서(-1)</code> : 다소 예민함, 배려 필요</li>
                                                    </ul>
                                                </div>
                                                <div className="border rounded-md p-3 bg-slate-50 border-slate-200">
                                                    <span className="font-bold text-slate-700 block mb-2">⚪ 해당 없음</span>
                                                    <p className="text-sm text-muted-foreground">
                                                        <code className="text-foreground font-semibold">해당없음</code> 또는 빈 칸<br />
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
                            <div className="bg-secondary rounded-lg p-4 text-center h-[134px] flex flex-col justify-center">
                                <div className="text-2xl font-bold">{students.length}</div>
                                <div className="text-xs text-muted-foreground">전체 학생</div>
                            </div>
                            <div className="bg-secondary rounded-lg p-4 text-center h-[134px] flex flex-col justify-center">
                                <div className="text-2xl font-bold text-blue-600">
                                    {students.filter((s) => s.gender === 'M').length}
                                </div>
                                <div className="text-xs text-muted-foreground">남학생</div>
                            </div>
                            <div className="bg-secondary rounded-lg p-4 text-center h-[134px] flex flex-col justify-center">
                                <div className="text-2xl font-bold text-pink-600">
                                    {students.filter((s) => s.gender === 'F').length}
                                </div>
                                <div className="text-xs text-muted-foreground">여학생</div>
                            </div>
                            <div className="bg-secondary rounded-lg p-4 text-center h-[134px] flex flex-col justify-center">
                                <div className="text-2xl font-bold">
                                    {students.length > 0
                                        ? Math.round(
                                            students.reduce((sum, s) => sum + s.academic_score, 0) /
                                            students.length
                                        )
                                        : '-'}
                                </div>
                                <div className="text-xs text-muted-foreground">평균 성적</div>
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
                                    📋 학생 관리
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
                                            <Button size="sm">+ 학생 추가</Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>새 학생 추가</DialogTitle>
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
                                                        min={1}
                                                        max={1000}
                                                        value={newStudent.academic_score}
                                                        onChange={(e) =>
                                                            setNewStudent({
                                                                ...newStudent,
                                                                academic_score: parseInt(e.target.value) || 500,
                                                            })
                                                        }
                                                    />
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <label className="text-right">생활지도</label>
                                                    <Input
                                                        className="col-span-3"
                                                        type="number"
                                                        min={-2}
                                                        max={3}
                                                        value={newStudent.behavior_score}
                                                        onChange={(e) =>
                                                            setNewStudent({
                                                                ...newStudent,
                                                                behavior_score: parseInt(e.target.value) || 0,
                                                            })
                                                        }
                                                    />
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <label className="text-right">유형</label>
                                                    <Select
                                                        value={newStudent.behavior_type}
                                                        onValueChange={(v) =>
                                                            setNewStudent({
                                                                ...newStudent,
                                                                behavior_type: v as BehaviorType,
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger className="col-span-3">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="NONE">해당없음</SelectItem>
                                                            <SelectItem value="LEADER">리더형</SelectItem>
                                                            <SelectItem value="BEHAVIOR">행동형</SelectItem>
                                                            <SelectItem value="EMOTIONAL">정서형</SelectItem>
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
                                    {/* 배정된 학생이 있으면 반별 탭 표시 */}
                                    {(() => {
                                        // 학년-반 조합 추출 및 정렬
                                        const gradeClassMap = new Map<string, { grade: string; classNum: string; count: number }>();
                                        students.forEach(s => {
                                            const parts = s.prev_info.split('-');
                                            if (parts.length >= 2) {
                                                const grade = parts[0];
                                                const classNum = parts[1];
                                                const key = `${grade}-${classNum}`;
                                                if (!gradeClassMap.has(key)) {
                                                    gradeClassMap.set(key, { grade, classNum, count: 0 });
                                                }
                                                gradeClassMap.get(key)!.count++;
                                            }
                                        });

                                        // 학년→반 순서로 정렬
                                        const sortedClasses = [...gradeClassMap.values()].sort((a, b) => {
                                            const gradeCompare = parseInt(a.grade) - parseInt(b.grade);
                                            if (gradeCompare !== 0) return gradeCompare;
                                            return parseInt(a.classNum) - parseInt(b.classNum);
                                        });

                                        return sortedClasses.map(({ grade, classNum, count }) => {
                                            const tabValue = `${grade}학년${classNum}반`;
                                            return (
                                                <TabsTrigger key={tabValue} value={tabValue}>
                                                    {grade}학년 {classNum}반 ({count})
                                                </TabsTrigger>
                                            );
                                        });
                                    })()}
                                </TabsList>

                                <div className="rounded-md border overflow-auto max-h-[500px]">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-background">
                                            <TableRow>
                                                <TableHead className="w-[60px] text-center">#</TableHead>
                                                <TableHead className="text-center">이름</TableHead>
                                                <TableHead className="text-center">이전학년</TableHead>
                                                <TableHead className="text-center">성별</TableHead>
                                                <TableHead className="text-center">성적</TableHead>
                                                <TableHead className="text-center">생활지도 점수</TableHead>
                                                <TableHead className="w-[140px] text-center">생활지도 유형</TableHead>
                                                <TableHead className="text-center">배정반</TableHead>
                                                <TableHead className="w-[80px] text-center">액션</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredStudents.map((student, index) => (
                                                <TableRow
                                                    key={student.id}
                                                    className={getBehaviorColor(student.behavior_type, student.behavior_score)}
                                                >
                                                    <TableCell className="text-muted-foreground text-center">{index + 1}</TableCell>
                                                    <TableCell className="text-center">
                                                        {editingId === student.id ? (
                                                            <Input
                                                                value={student.name}
                                                                onChange={(e) =>
                                                                    updateStudent(student.id, { name: e.target.value })
                                                                }
                                                                className="w-20 h-8 mx-auto text-center"
                                                            />
                                                        ) : (
                                                            <span className="font-medium">{student.name}</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {editingId === student.id ? (
                                                            <Input
                                                                value={student.prev_info}
                                                                onChange={(e) =>
                                                                    updateStudent(student.id, { prev_info: e.target.value })
                                                                }
                                                                className="w-20 h-8 mx-auto text-center"
                                                            />
                                                        ) : (
                                                            student.prev_info
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {editingId === student.id ? (
                                                            <Select
                                                                value={student.gender}
                                                                onValueChange={(v) =>
                                                                    updateStudent(student.id, { gender: v as Gender })
                                                                }
                                                            >
                                                                <SelectTrigger className="w-14 h-8 mx-auto">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="M">남</SelectItem>
                                                                    <SelectItem value="F">여</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        ) : (
                                                            student.gender === 'M' ? '남' : '여'
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {editingId === student.id ? (
                                                            <Input
                                                                type="number"
                                                                value={student.academic_score}
                                                                onChange={(e) =>
                                                                    updateStudent(student.id, {
                                                                        academic_score: parseInt(e.target.value) || 0,
                                                                    })
                                                                }
                                                                className="w-16 h-8 mx-auto text-center"
                                                            />
                                                        ) : (
                                                            student.academic_score
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {editingId === student.id ? (
                                                            <span className="text-sm font-medium">{student.behavior_score}</span>
                                                        ) : (
                                                            student.behavior_score
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {editingId === student.id ? (
                                                            <Select
                                                                value={
                                                                    student.behavior_type === 'NONE'
                                                                        ? 'NONE'
                                                                        : `${student.behavior_type}:${student.behavior_score}`
                                                                }
                                                                onValueChange={(v) => {
                                                                    if (v === 'NONE') {
                                                                        updateStudent(student.id, {
                                                                            behavior_type: 'NONE',
                                                                            behavior_score: 0,
                                                                        });
                                                                    } else {
                                                                        const [type, scoreStr] = v.split(':');
                                                                        updateStudent(student.id, {
                                                                            behavior_type: type as BehaviorType,
                                                                            behavior_score: parseInt(scoreStr),
                                                                        });
                                                                    }
                                                                }}
                                                            >
                                                                <SelectTrigger className="w-32 h-8 mx-auto">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="NONE">-</SelectItem>
                                                                    <SelectItem value="LEADER:1">🟢 리더 (+1)</SelectItem>
                                                                    <SelectItem value="LEADER:2">🟢 리더 (+2)</SelectItem>
                                                                    <SelectItem value="BEHAVIOR:-1">🟠 행동 (-1)</SelectItem>
                                                                    <SelectItem value="BEHAVIOR:-2">🟠 행동 (-2)</SelectItem>
                                                                    <SelectItem value="BEHAVIOR:-3">🟠 행동 (-3)</SelectItem>
                                                                    <SelectItem value="EMOTIONAL:-1">🔵 정서 (-1)</SelectItem>
                                                                    <SelectItem value="EMOTIONAL:-2">🔵 정서 (-2)</SelectItem>
                                                                    <SelectItem value="EMOTIONAL:-3">🔵 정서 (-3)</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        ) : (
                                                            <span className="text-xs">
                                                                {student.behavior_type === 'NONE' && '-'}
                                                                {student.behavior_type === 'LEADER' && `🟢리더 (+${student.behavior_score})`}
                                                                {student.behavior_type === 'BEHAVIOR' && `🟠행동 (${student.behavior_score})`}
                                                                {student.behavior_type === 'EMOTIONAL' && `🔵정서 (${student.behavior_score})`}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {student.assigned_class || '-'}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex gap-1 justify-center">
                                                            {editingId === student.id ? (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-7 px-2"
                                                                    onClick={() => setEditingId(null)}
                                                                >
                                                                    완료
                                                                </Button>
                                                            ) : (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-7 px-2"
                                                                    onClick={() => setEditingId(student.id)}
                                                                >
                                                                    ✏️
                                                                </Button>
                                                            )}
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 px-2 text-destructive"
                                                                onClick={() => deleteStudent(student.id)}
                                                            >
                                                                🗑️
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
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
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20"
                >
                    다음: 조건 설정 →
                </Button>
            </div>
        </div >
    );
}
