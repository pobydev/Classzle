'use client';

import { useMemo } from 'react';
import { Student, AssignmentChange } from '@/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { HistoryPanel } from './HistoryPanel';
import { sameClass } from '@/lib/assignment/problem';
import { buildReportHtml } from '@/lib/reportHtml';
import { toast } from 'sonner';
import {
    Users,
    ArrowsLeftRight,
    ArrowRight,
    CheckCircle,
    WarningCircle,
    Info,
    User,
    Buildings,
    TrendUp,
    Clock,
    Swap,
    Handshake
} from '@phosphor-icons/react';

export function AssignmentReportDialog({
    open,
    onOpenChange,
    students,
    groups,
    history,
}
    : {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        students: Student[];
        groups: any[];
        history: AssignmentChange[];
    }) {
    // 1. 관계별 상세 정보 (이전 학년도 반별 그룹화)
    const relationStats = useMemo(() => {
        const stats = {
            keepTotal: 0,
            keepMet: 0,
            avoidTotal: 0,
            avoidMet: 0,
            // 이전 반별로 그룹화된 상세 정보
            classDetails: {} as Record<string, any[]>
        };

        // 학년-반 추출 함수 (prev_info: "1-2" -> "1학년 2반")
        const getPrevClassLabel = (prevInfo: string) => {
            const parts = prevInfo.split('-');
            if (parts.length >= 2) {
                return `${parts[0]}학년 ${parts[1]}반`;
            }
            return prevInfo || '정보 없음';
        };

        // 학년-반-번호 파싱 및 비교 함수
        const compareStudents = (a: Student, b: Student) => {
            const partsA = (a.prev_info || '').split('-').map(p => parseInt(p) || 0);
            const partsB = (b.prev_info || '').split('-').map(p => parseInt(p) || 0);

            for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                const valA = partsA[i] || 0;
                const valB = partsB[i] || 0;
                if (valA !== valB) return valA - valB;
            }
            return a.name.localeCompare(b.name, 'ko');
        };

        // 모든 이전 반 목록 및 초기화
        const prevClasses = Array.from(new Set(students.map(s => getPrevClassLabel(s.prev_info)))) as string[];
        prevClasses.sort((a, b) => {
            const matchA = a.match(/(\d+)학년\s+(\d+)반/);
            const matchB = b.match(/(\d+)학년\s+(\d+)반/);
            if (matchA && matchB) {
                const gradeA = parseInt(matchA[1]);
                const classA = parseInt(matchA[2]);
                const gradeB = parseInt(matchB[1]);
                const classB = parseInt(matchB[2]);
                if (gradeA !== gradeB) return gradeA - gradeB;
                return classA - classB;
            }
            return a.localeCompare(b, 'ko');
        });
        prevClasses.forEach(pc => { stats.classDetails[pc] = []; });

        const processedGlobalPairs = new Set<string>();

        students.forEach(s => {
            const sPrevClass = getPrevClassLabel(s.prev_info);

            // 공통 로직 처리 함수
            const processRelation = (partnerId: string, type: 'keep' | 'avoid') => {
                const partner = students.find(p => p.id === partnerId);
                if (!partner) return;

                const pPrevClass = getPrevClassLabel(partner.prev_info);
                const pairId = [s.id, partner.id].sort().join('-');

                // 1. 통계 집계 (전역 중복 방지)
                const isMet = type === 'keep'
                    ? sameClass(s.assigned_class, partner.assigned_class)
                    : (!sameClass(s.assigned_class, partner.assigned_class) && !!s.assigned_class);

                if (!processedGlobalPairs.has(pairId)) {
                    if (type === 'keep') {
                        stats.keepTotal++;
                        if (isMet) stats.keepMet++;
                    } else {
                        stats.avoidTotal++;
                        if (isMet) stats.avoidMet++;
                    }
                    processedGlobalPairs.add(pairId);
                }

                // 2. 리스트 출력 로직 (같은 반이면 앞번호 학생 기준 1회만, 다른 반이면 양쪽 모두 출력)
                let shouldAddToList = false;
                if (sPrevClass !== pPrevClass) {
                    shouldAddToList = true; // 다른 반이면 무조건 내 반 목록에 추가
                } else {
                    // 같은 반인 경우, 정렬 순서상 앞선 학생일 때만 추가
                    if (compareStudents(s, partner) < 0) {
                        shouldAddToList = true;
                    }
                }

                if (shouldAddToList && stats.classDetails[sPrevClass]) {
                    const detail = {
                        type,
                        names: [s.name, partner.name],
                        status: isMet ? '만족' : '미충족',
                        classes: [s.assigned_class || '미배정', partner.assigned_class || '미배정'],
                        // 정렬을 위해 원본 학생 객체 저장 (옵션)
                        sortKeyStudent: s
                    };
                    stats.classDetails[sPrevClass].push(detail);
                }
            };

            s.keep_ids.forEach(kid => processRelation(kid, 'keep'));
            s.avoid_ids.forEach(aid => processRelation(aid, 'avoid'));
        });

        // 각 반별 리스트 정렬 (이전 번호 순)
        Object.values(stats.classDetails).forEach(list => {
            list.sort((a, b) => compareStudents(a.sortKeyStudent, b.sortKeyStudent));
        });

        return stats;
    }, [students]);

    // 1.5. 이동 학생 명단 계산
    const movementStats = useMemo(() => {
        if (history.length === 0) return [];

        // 학생별 최초 상태 찾기
        const studentFirstChangeMap = new Map<string, string | null>();
        // history는 시간순이므로 정순으로 돌면서 처음 발견되는 oldClass를 저장
        history.forEach(change => {
            if (!studentFirstChangeMap.has(change.studentId)) {
                studentFirstChangeMap.set(change.studentId, change.oldClass);
            }
            if (change.type === 'swap' && change.partnerId && !studentFirstChangeMap.has(change.partnerId)) {
                studentFirstChangeMap.set(change.partnerId, change.newClass); // swap 파트너의 old는 newClass임
            }
        });

        const movements = students.filter(s => {
            if (!s.assigned_class) return false;
            const initialClass = studentFirstChangeMap.get(s.id);
            return initialClass !== undefined && initialClass !== s.assigned_class && initialClass !== null;
        }).map(s => ({
            id: s.id,
            name: s.name,
            prev_info: s.prev_info,
            initialClass: studentFirstChangeMap.get(s.id),
            finalClass: s.assigned_class
        }));

        // 최초 배정반(initialClass) 기준, 그리고 이전 정보(학년-반-번호) 및 이름순으로 정밀 정렬
        return movements.sort((a, b) => {
            // 1. 최초 반 자연 정렬 (1반, 2반, 10반...)
            const classA = a.initialClass || '';
            const classB = b.initialClass || '';

            const classCompare = classA.localeCompare(classB, 'ko', { numeric: true });
            if (classCompare !== 0) return classCompare;

            // 2. 이전 정보(prev_info) 정밀 정렬 ("3-2-15" 성분별 비교)
            const partsA = (a.prev_info || '').split('-').map(p => parseInt(p) || 0);
            const partsB = (b.prev_info || '').split('-').map(p => parseInt(p) || 0);

            for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                const valA = partsA[i] || 0;
                const valB = partsB[i] || 0;
                if (valA !== valB) return valA - valB;
            }

            // 3. 마지막으로 이름순
            return a.name.localeCompare(b.name, 'ko');
        });
    }, [students, history]);

    // 2. 그룹별 배정 현황
    const groupStats = useMemo(() => {
        return groups.map(g => ({
            name: g.name,
            color: g.color,
            students: students.filter(s => g.member_ids.includes(s.id)).map(s => ({
                name: s.name,
                class: s.assigned_class || '미배정'
            }))
        }));
    }, [students, groups]);

    // 3. 특수 배정 (고정배정, 전출)
    const specialStats = useMemo(() => ({
        fixed: students.filter(s => s.fixed_class).map(s => ({
            name: s.name,
            class: s.assigned_class || '미배정',
            target: s.fixed_class,
            isMet: sameClass(s.assigned_class, s.fixed_class)
        })),
        preTransfer: students.filter(s => s.is_pre_transfer).map(s => ({
            name: s.name,
            class: s.assigned_class || '미배정'
        }))
    }), [students]);

    const handlePrint = async () => {
        const html = buildReportHtml({
            history,
            groupStats,
            relationStats,
            movementStats,
            specialStats,
            printedAt: new Date().toLocaleString(),
        });

        if (window.electronAPI) {
            const opened = await window.electronAPI.printPreview(html).catch(() => false);
            if (!opened) toast.error('인쇄 미리보기를 열지 못했습니다. 다시 시도해 주세요.');
        } else {
            // 웹 환경용 iframe 인쇄 로직
            const oldFrame = document.getElementById('print-frame');
            if (oldFrame) document.body.removeChild(oldFrame);

            const iframe = document.createElement('iframe');
            iframe.id = 'print-frame';
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            document.body.appendChild(iframe);

            const printWindow = iframe.contentWindow;
            if (printWindow) {
                const webHtml = html.replace('</body>', `
        <script>
    window.onload = function () {
        window.print();
    };
                    </script >
                    </body >
        `);
                printWindow.document.write(webHtml);
                printWindow.document.close();
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent id="report-dialog-content" className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-title flex items-center gap-2">
                        학생 배정 상세 분석 리포트
                    </DialogTitle>
                </DialogHeader>


                <Tabs defaultValue="fulfillment" className="flex-1 overflow-hidden flex flex-col">
                    <div className="px-6 border-b">
                        <TabsList className="w-full justify-start h-12 bg-transparent gap-6 p-0">
                            <TabsTrigger
                                value="fulfillment"
                                className="flex-none h-full border-0 border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-2"
                            >
                                이행 현황
                            </TabsTrigger>
                            <TabsTrigger
                                value="movements"
                                className="flex-none h-full border-0 border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-2 flex items-center gap-1.5"
                            >
                                <TrendUp size={16} />
                                이동 명단 ({movementStats.length})
                            </TabsTrigger>
                            <TabsTrigger
                                value="history"
                                className="flex-none h-full border-0 border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-2 flex items-center gap-1.5"
                            >
                                <Clock size={16} />
                                변경 이력 ({history.length})
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        <TabsContent value="fulfillment" className="m-0 space-y-6">
                            {/* 분리 배정, 함께 배정 이행 요약 */}
                            <div className="grid grid-cols-2 gap-4">
                                <Card className="items-center justify-center text-center py-4 gap-1">
                                    <div className="text-body font-medium flex items-center gap-1.5"><Handshake size={16} className="text-accent" aria-hidden="true" />함께 배정</div>
                                    <div className="text-title font-bold">
                                        {relationStats.keepMet} / {relationStats.keepTotal}
                                    </div>
                                    <p className="text-caption text-soft">쌍별 이행률: {relationStats.keepTotal > 0 ? Math.round((relationStats.keepMet / relationStats.keepTotal) * 100) : 100}%</p>
                                </Card>
                                <Card className="items-center justify-center text-center py-4 gap-1">
                                    <div className="text-body font-medium flex items-center gap-1.5"><ArrowsLeftRight size={16} className="text-danger" aria-hidden="true" />분리 배정</div>
                                    <div className="text-title font-bold">
                                        {relationStats.avoidMet} / {relationStats.avoidTotal}
                                    </div>
                                    <p className="text-caption text-soft">쌍별 이행률: {relationStats.avoidTotal > 0 ? Math.round((relationStats.avoidMet / relationStats.avoidTotal) * 100) : 100}%</p>
                                </Card>
                            </div>

                            {/* 관계 상세 현황 (반별 그룹화) */}
                            <div className="space-y-4">
                                <h4 className="font-bold text-body flex items-center gap-2">학급별 관계 상세 현황</h4>
                                {Object.values(relationStats.classDetails).every((details) => details.length === 0) ? (
                                    <div className="p-8 text-center text-soft text-body border-2 border-dashed rounded-card">설정된 분리 배정과 함께 배정이 없습니다.</div>
                                ) : (
                                    <div className="space-y-6">
                                        {Object.entries(relationStats.classDetails)
                                            .filter(([_, details]) => details.length > 0)
                                            .map(([className, details]) => (
                                                <div key={className} className="space-y-3">
                                                    <h4 className="font-bold text-ink flex items-center gap-2 bg-canvas p-2.5 rounded-card border border-line">
                                                        <Buildings size={18} className="text-soft" />
                                                        <span className="text-small">이전 학년도: {className}</span>
                                                    </h4>
                                                    <div className="divide-y divide-line bg-card rounded-card border border-line overflow-hidden">
                                                        {details.map((detail, idx) => (
                                                            <div key={idx} className="flex items-center justify-between p-4 px-5 text-body hover:bg-surface-hover transition-colors">
                                                                <div className="flex items-center gap-4">
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={detail.type === 'keep'
                                                                            ? 'border-tint text-accent-ink bg-wash px-2.5 py-0.5'
                                                                            : 'border-transparent text-danger bg-danger-wash px-2.5 py-0.5'
                                                                        }
                                                                    >
                                                                        {detail.type === 'keep' ? '함께 배정' : '분리 배정'}
                                                                    </Badge>
                                                                    <span className="font-semibold text-ink flex items-center gap-3">
                                                                        <span className="flex items-center gap-1.5">
                                                                            <User size={16} className="text-soft" />
                                                                            {detail.names[0]}
                                                                            <Badge variant="secondary" className="text-micro px-1.5 h-5 font-normal text-soft bg-surface-hover hover:bg-line">{detail.classes[0]}</Badge>
                                                                        </span>
                                                                        <ArrowsLeftRight size={14} className="text-soft" />
                                                                        <span className="flex items-center gap-1.5">
                                                                            <User size={16} className="text-soft" />
                                                                            {detail.names[1]}
                                                                            <Badge variant="secondary" className="text-micro px-1.5 h-5 font-normal text-soft bg-surface-hover hover:bg-line">{detail.classes[1]}</Badge>
                                                                        </span>
                                                                    </span>
                                                                </div>
                                                                <Badge
                                                                    className={`min-w-[60px] justify-center text-micro font-bold ${detail.status === '만족'
                                                                        ? 'bg-wash text-accent-ink border-tint'
                                                                        : 'bg-danger-wash text-danger border-transparent'
                                                                        }`}
                                                                    variant="outline"
                                                                >
                                                                    {detail.status === '만족' ? <CheckCircle size={14} className="mr-1" /> : <WarningCircle size={14} className="mr-1" />}
                                                                    {detail.status}
                                                                </Badge>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
                                <div className="space-y-4">
                                    <h4 className="font-bold text-body flex items-center gap-2 text-ink">
                                        <Users size={18} className="text-accent" />
                                        그룹 분산 현황
                                    </h4>
                                    <div className="space-y-3">
                                        {groupStats.map(g => (
                                            <Card key={g.name} className="overflow-hidden py-0 gap-0">
                                                <CardHeader className="p-3.5 py-2.5 bg-canvas border-b flex flex-row items-center gap-2">
                                                    <div className={`w-3 h-3 rounded-full ${g.color.split(' ')[0]}`} />
                                                    <CardTitle className="text-caption font-bold text-ink">{g.name}</CardTitle>
                                                </CardHeader>
                                                <CardContent className="p-4">
                                                    <div className="flex flex-wrap gap-1.5 text-caption">
                                                        {g.students.map((s, i) => (
                                                            <span key={i} className="bg-surface-hover text-soft px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                                                                <User size={12} className="text-soft" />
                                                                {s.name} <span className="text-faint">|</span> {s.class}
                                                            </span>
                                                        ))}
                                                        {g.students.length === 0 && <span className="text-soft">소속 학생 없음</span>}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                    {groupStats.length === 0 && <p className="text-body text-soft">설정된 그룹 분산이 없습니다.</p>}
                                </div>

                                <div className="space-y-4">
                                    <h4 className="font-bold text-body flex items-center gap-2 text-ink">
                                        <CheckCircle size={18} className="text-accent" />
                                        고정 배정 및 특수 현황
                                    </h4>
                                    <div className="space-y-3">
                                        <Card className="overflow-hidden py-0 gap-0">
                                            <CardHeader className="p-3.5 py-2.5 bg-canvas border-b">
                                                <CardTitle className="text-caption font-bold text-ink">고정 배정 학생</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-4 space-y-2.5">
                                                {specialStats.fixed.map((s, i) => (
                                                    <div key={i} className="flex justify-between items-center text-caption">
                                                        <div className="flex items-center gap-2">
                                                            <User size={14} className="text-soft" />
                                                            <span className="font-semibold text-ink">{s.name}</span>
                                                            <span className="text-soft">({s.target} 고정)</span>
                                                        </div>
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-micro h-5 rounded-full px-2 ${s.isMet
                                                                ? 'border-tint text-accent-ink bg-wash'
                                                                : 'border-transparent text-danger bg-danger-wash'
                                                                }`}
                                                        >
                                                            {s.isMet ? '만족' : '미충족'} ({s.class})
                                                        </Badge>
                                                    </div>
                                                ))}
                                                {specialStats.fixed.length === 0 && <p className="text-caption text-soft">고정 배정 학생 없음</p>}
                                            </CardContent>
                                        </Card>

                                        <Card className="overflow-hidden py-0 gap-0">
                                            <CardHeader className="p-3.5 py-2.5 bg-canvas border-b">
                                                <CardTitle className="text-caption font-bold text-ink">전출 예정 학생</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-4">
                                                <div className="flex flex-wrap gap-1.5 text-caption">
                                                    {specialStats.preTransfer.map((s, i) => (
                                                        <span key={i} className="text-accent-ink bg-wash px-2.5 py-1 rounded-full border border-tint font-medium flex items-center gap-1">
                                                            <User size={12} className="text-accent" />
                                                            {s.name} <span className="text-faint">|</span> {s.class}
                                                        </span>
                                                    ))}
                                                    {specialStats.preTransfer.length === 0 && <span className="text-soft">전출 예정 학생 없음</span>}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="movements" className="m-0 space-y-4">
                            <div className="flex justify-between items-center">
                                <p className="text-body text-soft">최초 배정 결과 대비 <strong>{movementStats.length}명</strong>의 학생이 이동되었습니다.</p>
                            </div>

                            {movementStats.length === 0 ? (
                                <div className="text-center py-20 text-soft border border-dashed rounded-card bg-canvas">
                                    <Info size={32} className="mx-auto mb-3 text-faint" />
                                    <p className="text-body">이동한 학생이 없습니다.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-line bg-card rounded-card border border-line overflow-hidden">
                                    {movementStats.map((s, i) => (
                                        <div key={s.id} className="flex items-center justify-between p-4 px-5 text-body hover:bg-surface-hover transition-colors">
                                            <div className="flex items-center gap-5">
                                                <span className="text-caption font-bold text-soft w-5">{i + 1}</span>
                                                <div className="flex items-center gap-2">
                                                    <User size={16} className="text-soft" />
                                                    <span className="font-bold text-ink">{s.name}</span>
                                                    <Badge variant="secondary" className="text-micro px-1.5 h-5 font-normal text-soft bg-surface-hover hover:bg-line">
                                                        {s.prev_info.split('-').slice(0, 2).join('-')} 반
                                                    </Badge>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-caption text-soft">최초</span>
                                                    <Badge variant="outline" className="font-semibold text-soft bg-card border-line px-2 py-0.5 rounded-card">
                                                        {s.initialClass}
                                                    </Badge>
                                                </div>
                                                <ArrowRight size={14} className="text-soft" />
                                                <div className="flex items-center gap-2">
                                                    <span className="text-caption text-accent-ink">최종</span>
                                                    <Badge className="font-bold border-none px-3 py-1 rounded-input">
                                                        {s.finalClass}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="history" className="m-0">
                            {history.length === 0 ? (
                                <div className="text-center py-20 text-soft border border-dashed rounded-card bg-canvas">
                                    <Clock size={32} className="mx-auto mb-3 text-faint" />
                                    <p className="text-body font-medium">배정 변경 이력이 없습니다.</p>
                                    <p className="text-caption mt-1">자동 배정 이후의 수동 변경 사항이 여기에 표시됩니다.</p>
                                </div>
                            ) : (
                                <HistoryPanel history={history} students={students} />
                            )}
                        </TabsContent>
                    </div>

                    <div className="p-4 border-t px-6 flex justify-between bg-canvas">
                        <Button
                            variant="outline"
                            onClick={handlePrint}
                            className="gap-2"
                        >
                            보고서 인쇄
                        </Button>
                        <Button onClick={() => onOpenChange(false)}>닫기</Button>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
