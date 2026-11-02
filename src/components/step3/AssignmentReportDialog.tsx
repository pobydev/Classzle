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
    Swap
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
                    ? (s.assigned_class === partner.assigned_class && s.assigned_class !== null)
                    : (s.assigned_class !== partner.assigned_class && s.assigned_class !== null);

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
                        status: isMet ? '만족' : (type === 'keep' ? '미충족' : '충돌'),
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
            isMet: s.assigned_class === s.fixed_class
        })),
        preTransfer: students.filter(s => s.is_pre_transfer).map(s => ({
            name: s.name,
            class: s.assigned_class || '미배정'
        }))
    }), [students]);

    const handlePrint = () => {
        // 기존 iframe 제거
        const oldFrame = document.getElementById('print-frame');
        if (oldFrame) document.body.removeChild(oldFrame);

        // 새 iframe 생성
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
        if (!printWindow) return;

        const historyHtml = history.length === 0
            ? '<tr><td colspan="5" style="text-align:center; padding: 40px; color: #999;">배정 변경 이력이 없습니다.</td></tr>'
            : history.map((c, i) => `
                <tr>
                    <td style="text-align:center;">${i + 1}</td>
                    <td style="text-align:center;">${c.source === 'auto' ? '자동' : '수동'}</td>
                    <td style="text-align:center; font-size: 11px;">${new Date(c.timestamp).toLocaleTimeString()}</td>
                    <td style="font-weight: bold;">
                        ${c.type === 'swap' ? `${c.studentName}<br>↔${c.partnerName}` : c.studentName}
                    </td>
                    <td>
                        ${c.type === 'swap'
                    ? `${c.studentName}: ${c.oldClass} →${c.newClass}<br>${c.partnerName}: ${c.newClass} →${c.oldClass}`
                    : `${c.oldClass || '미배정'} → ${c.newClass || '미배정'}`
                }
                    </td>
                </tr>
            `).join('');

        const groupHtml = groupStats.length === 0
            ? '<p style="color: #999; margin-left: 10px; font-size: 11pt;">설정된 분산 배정 그룹이 없습니다.</p>'
            : groupStats.map(g => `
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 11pt; color: #333;">그룹명: ${g.name}</strong>
                    <div style="margin-top: 5px; padding-left: 15px; font-size: 10pt; line-height: 1.6;">
                        ${g.students.length === 0
                    ? '<span style="color: #999;">소속 학생 없음</span>'
                    : g.students.map(s => `${s.name} (${s.class})`).join(', ')
                }
                    </div>
                </div>
            `).join('');

        const relationHtml = Object.keys(relationStats.classDetails).length === 0
            ? '<p style="color: #999; margin-left: 10px; font-size: 11pt;">설정된 관계 조건이 없습니다.</p>'
            : Object.entries(relationStats.classDetails)
                .filter(([_, details]) => details.length > 0)
                .map(([className, details]) => `
                <div style="margin-top: 20px; break-inside: auto;">
                    <h3 style="font-size: 13pt; color: #444; margin-bottom: 8px; border-left: 4px solid #6366f1; padding-left: 10px; break-after: avoid;">
                        이전 학년도: ${className}
                    </h3>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 5px; break-inside: auto;">
                        <thead style="display: table-header-group;">
                            <tr style="background-color: #f8fafc;">
                                <th style="width: 70px;">유형</th>
                                <th>대상 학생 (최종 배정반)</th>
                                <th style="width: 70px;">상태</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${details.map(d => `
                                <tr>
                                    <td style="text-align:center;">
                                        <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9pt; font-weight: bold; 
                                            ${d.type === 'keep'
                        ? 'background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;'
                        : 'background-color: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;'}">
                                            ${d.type === 'keep' ? '💕 희망' : '🚫 회피'}
                                        </span>
                                    </td>
                                    <td>
                                        ${d.names[0]} (${d.classes[0]}) - ${d.names[1]} (${d.classes[1]})
                                    </td>
                                    <td style="text-align:center; font-weight: bold; color: ${d.status === '만족' ? '#059669' : '#dc2626'}">${d.status}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `).join('');

        const movementHtml = movementStats.length === 0
            ? '<p style="color: #999; margin-left: 10px; font-size: 11pt;">이동한 학생이 없습니다.</p>'
            : `
                <div style="margin-top: 20px; break-inside: auto;">
                    <p style="font-size: 10pt; color: #666; margin-bottom: 10px; break-after: avoid;">
                        * 최초 배정된 반에서 최종 배정된 반이 변경된 학생들의 목록입니다. (최초 반 번호순 정렬)
                    </p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 5px; break-inside: auto;">
                        <thead style="display: table-header-group;">
                            <tr style="background-color: #f8fafc;">
                                <th style="width: 50px;">No</th>
                                <th>학생명</th>
                                <th>최초 배정반</th>
                                <th>최종 배정반</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${movementStats.map((s, i) => `
                                <tr>
                                    <td style="text-align:center;">${i + 1}</td>
                                    <td style="text-align:center; font-weight: bold;">${s.name}</td>
                                    <td style="text-align:center;">${s.initialClass}</td>
                                    <td style="text-align:center; font-weight: bold; color: #4f46e5;">${s.finalClass}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

        const specialHtml = `
            <div style="padding: 10px; border: 1px solid #333; border-radius: 4px;">
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 11pt; color: #333;">고정 배정 학생 현황</strong>
                    <div style="margin-top: 5px; padding-left: 15px;">
                        ${specialStats.fixed.length === 0
                ? '<span style="color: #999; font-size: 10pt;">고정 배정 학생 없음</span>'
                : specialStats.fixed.map(s => `
                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 10pt;">
                                    <span>${s.name} (${s.target} 반 희망)</span>
                                    <span style="color: ${s.isMet ? '#2e7d32' : '#d32f2f'}; font-weight: bold; font-size: 9pt;">
                                        ${s.isMet ? `만족(${s.class || '미배정'})` : `미충족(${s.class || '미배정'})`}
                                    </span>
                                </div>
                            `).join('')}
                    </div>
                </div>
                <div style="margin-top: 15px; border-top: 1px dashed #eee; padding-top: 15px;">
                    <strong style="font-size: 11pt; color: #333;">전출 예정 학생 현황</strong>
                    <div style="margin-top: 5px; padding-left: 15px; font-size: 10pt; line-height: 1.6;">
                        ${specialStats.preTransfer.length === 0
                ? '<span style="color: #999;">전출 예정 학생 없음</span>'
                : specialStats.preTransfer.map(s => `${s.name} (${s.class || '미배정'})`).join(', ')
            }
                    </div>
                </div>
            </div>
        `;

        const html = `
        <!DOCTYPE html>
            <html>
                <head>
                    <title>학생 배정 상세 리포트</title>
                    <style>
                        @page { size: A4; margin: 20mm; }
                        body { font-family: sans-serif; margin: 0; padding: 0; line-height: 1.5; color: #333; }
                        .header { text-align: center; margin-bottom: 30px; }
                        .header h1 { font-size: 24pt; margin: 0; }
                        .header p { text-align: right; font-size: 10pt; color: #666; }
                        h2 { font-size: 16pt; border-bottom: 2px solid #333; padding-bottom: 5px; margin-top: 30px; break-after: avoid; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; break-inside: auto; }
                        thead { display: table-header-group; }
                        th, td { border: 1px solid #333; padding: 8px; font-size: 11pt; word-break: break-all; vertical-align: middle; }
                        th { background-color: #f5f5f5; font-weight: bold; }
                        tr { break-inside: avoid; break-after: auto; }
                        .summary-table th { width: 40%; }
                        .summary-table td { text-align: center; }
                        .history-table th:nth-child(1) { width: 40px; }
                        .history-table th:nth-child(2) { width: 60px; }
                        .history-table th:nth-child(3) { width: 100px; }
                        .history-table th:nth-child(4) { width: 150px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <p>출력 일시: ${new Date().toLocaleString()}</p>
                        <h1>학생 배정 상세 리포트</h1>
                    </div>

                    <h2>1. 그룹별 배정 현황 및 특수 배정 현황</h2>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div style="padding: 10px; border: 1px solid #333; border-radius: 4px;">
                            ${groupHtml}
                        </div>
                        ${specialHtml}
                    </div>

                    <h2>2. 제약 조건 이행 요약</h2>
                    <table class="summary-table">
                        <thead>
                            <tr>
                                <th>구분 (제약 조건)</th>
                                <th>이행수 / 전체수</th>
                                <th>이행률(%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>함께 배정 희망</td>
                                <td>${relationStats.keepMet} / ${relationStats.keepTotal}</td>
                                <td>${relationStats.keepTotal > 0 ? Math.round((relationStats.keepMet / relationStats.keepTotal) * 100) : 100}%</td>
                            </tr>
                            <tr>
                                <td>기피 대상 피함</td>
                                <td>${relationStats.avoidMet} / ${relationStats.avoidTotal}</td>
                                <td>${relationStats.avoidTotal > 0 ? Math.round((relationStats.avoidMet / relationStats.avoidTotal) * 100) : 100}%</td>
                            </tr>
                            <tr>
                                <td>고정 배정 학생 이행</td>
                                <td>${specialStats.fixed.filter(s => s.isMet).length} / ${specialStats.fixed.length}</td>
                                <td>${specialStats.fixed.length > 0 ? Math.round((specialStats.fixed.filter(s => s.isMet).length / specialStats.fixed.length) * 100) : 100}%</td>
                            </tr>
                        </tbody>
                    </table>

                    <h3 style="margin-top: 15px; font-size: 13pt;">학급별 관계 상세 현황</h3>
                    ${relationHtml}

                    <h2>3. 이동 학생 명단 (총 ${movementStats.length}명)</h2>
                    ${movementHtml}

                    <h2>4. 변경 누적 이력 (총 ${history.length}건)</h2>
                    <table class="history-table">

                        <thead>
                            <tr>
                                <th>No</th>
                                <th>변경구분</th>
                                <th>변경시각</th>
                                <th>대상 학생</th>
                                <th>전환 상세 내용</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${historyHtml}
                        </tbody>
                    </table>

                    <div style="margin-top: 50px; text-align: center; font-size: 9pt; color: #999;">
                        Classzle - 학급 편성 도우미
                    </div>
                </body>
            </html>
    `;

        if (window.electronAPI) {
            window.electronAPI.printPreview(html);
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
            <DialogContent id="report-dialog-content" className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-2xl flex items-center gap-2">
                        학생 배정 상세 분석 리포트
                    </DialogTitle>
                </DialogHeader>


                <Tabs defaultValue="fulfillment" className="flex-1 overflow-hidden flex flex-col">
                    <div className="px-6 border-b">
                        <TabsList className="w-full justify-start h-12 bg-transparent gap-6 p-0">
                            <TabsTrigger
                                value="fulfillment"
                                className="h-full border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-2"
                            >
                                이행 현황
                            </TabsTrigger>
                            <TabsTrigger
                                value="movements"
                                className="h-full border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-2 flex items-center gap-1.5"
                            >
                                <TrendUp size={16} />
                                이동 명단 ({movementStats.length})
                            </TabsTrigger>
                            <TabsTrigger
                                value="history"
                                className="h-full border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-2 flex items-center gap-1.5"
                            >
                                <Clock size={16} />
                                변경 이력 ({history.length})
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        <TabsContent value="fulfillment" className="m-0 space-y-6">
                            {/* 관계 제약 이행 요약 */}
                            <div className="grid grid-cols-2 gap-4">
                                <Card className="bg-pink-50/30 border-pink-100 flex flex-col items-center justify-center text-center py-4 rounded-xl shadow-sm">
                                    <div className="text-sm font-medium text-pink-700 mb-1">함께 배정 희망</div>
                                    <div className="text-2xl font-bold text-pink-600">
                                        {relationStats.keepMet} / {relationStats.keepTotal}
                                    </div>
                                    <p className="text-xs text-pink-600/70">쌍별 이행률: {relationStats.keepTotal > 0 ? Math.round((relationStats.keepMet / relationStats.keepTotal) * 100) : 100}%</p>
                                </Card>
                                <Card className="bg-red-50/30 border-red-100 flex flex-col items-center justify-center text-center py-4 rounded-xl shadow-sm">
                                    <div className="text-sm font-medium text-red-700 mb-1">기피 대상 피함</div>
                                    <div className="text-2xl font-bold text-red-600">
                                        {relationStats.avoidMet} / {relationStats.avoidTotal}
                                    </div>
                                    <p className="text-xs text-red-600/70">충돌 회피율: {relationStats.avoidTotal > 0 ? Math.round((relationStats.avoidMet / relationStats.avoidTotal) * 100) : 100}%</p>
                                </Card>
                            </div>

                            {/* 관계 상세 현황 (반별 그룹화) */}
                            <div className="space-y-4">
                                <h4 className="font-bold text-sm flex items-center gap-2">학급별 관계 상세 현황</h4>
                                {Object.keys(relationStats.classDetails).length === 0 ? (
                                    <div className="p-8 text-center text-muted-foreground text-sm border-2 border-dashed rounded-xl">설정된 관계 제약 조건이 없습니다.</div>
                                ) : (
                                    <div className="space-y-6">
                                        {Object.entries(relationStats.classDetails)
                                            .filter(([_, details]) => details.length > 0)
                                            .map(([className, details]) => (
                                                <div key={className} className="space-y-3">
                                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                                        <Buildings size={18} className="text-slate-400" weight="fill" />
                                                        <span className="text-[13px]">이전 학년도: {className}</span>
                                                    </h4>
                                                    <div className="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                                        {details.map((detail, idx) => (
                                                            <div key={idx} className="flex items-center justify-between p-4 px-5 text-sm hover:bg-slate-50 transition-colors">
                                                                <div className="flex items-center gap-4">
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={detail.type === 'keep'
                                                                            ? 'border-blue-200 text-blue-700 bg-blue-50/50 rounded-full px-2.5 py-0.5'
                                                                            : 'border-red-200 text-red-700 bg-red-50/50 rounded-full px-2.5 py-0.5'
                                                                        }
                                                                    >
                                                                        {detail.type === 'keep' ? '함께 희망' : '서로 회피'}
                                                                    </Badge>
                                                                    <span className="font-semibold text-slate-700 flex items-center gap-3">
                                                                        <span className="flex items-center gap-1.5">
                                                                            <User size={16} className="text-slate-400" />
                                                                            {detail.names[0]}
                                                                            <Badge variant="secondary" className="text-[11px] px-1.5 h-5 font-normal text-slate-500 bg-slate-100 hover:bg-slate-200">{detail.classes[0]}</Badge>
                                                                        </span>
                                                                        <ArrowsLeftRight size={14} className="text-slate-300" />
                                                                        <span className="flex items-center gap-1.5">
                                                                            <User size={16} className="text-slate-400" />
                                                                            {detail.names[1]}
                                                                            <Badge variant="secondary" className="text-[11px] px-1.5 h-5 font-normal text-slate-500 bg-slate-100 hover:bg-slate-200">{detail.classes[1]}</Badge>
                                                                        </span>
                                                                    </span>
                                                                </div>
                                                                <Badge
                                                                    className={`min-w-[60px] justify-center text-[11px] font-bold ${detail.status === '만족'
                                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                                        : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                                                        }`}
                                                                    variant="outline"
                                                                >
                                                                    {detail.status === '만족' ? <CheckCircle size={14} className="mr-1" weight="fill" /> : <WarningCircle size={14} className="mr-1" weight="fill" />}
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
                                    <h4 className="font-bold text-sm flex items-center gap-2 text-slate-800">
                                        <Users size={18} className="text-indigo-500" weight="bold" />
                                        분산 배정 그룹별 현황
                                    </h4>
                                    <div className="space-y-3">
                                        {groupStats.map(g => (
                                            <Card key={g.name} className="overflow-hidden border-slate-200 shadow-sm rounded-2xl">
                                                <CardHeader className="p-3.5 py-2.5 bg-slate-50/50 border-b flex flex-row items-center gap-2">
                                                    <div className="w-1.5 h-3.5 rounded-full bg-indigo-400" />
                                                    <CardTitle className="text-xs font-bold text-slate-700">{g.name}</CardTitle>
                                                </CardHeader>
                                                <CardContent className="p-4">
                                                    <div className="flex flex-wrap gap-1.5 text-xs">
                                                        {g.students.map((s, i) => (
                                                            <span key={i} className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                                                                <User size={12} className="text-slate-400" />
                                                                {s.name} <span className="opacity-30">|</span> {s.class}
                                                            </span>
                                                        ))}
                                                        {g.students.length === 0 && <span className="text-muted-foreground opacity-60">소속 학생 없음</span>}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                    {groupStats.length === 0 && <p className="text-sm text-muted-foreground opacity-60 italic">설정된 분산 배정 그룹이 없습니다.</p>}
                                </div>

                                <div className="space-y-4">
                                    <h4 className="font-bold text-sm flex items-center gap-2 text-slate-800">
                                        <CheckCircle size={18} className="text-indigo-500" weight="bold" />
                                        고정 배정 및 특수 현황
                                    </h4>
                                    <div className="space-y-3">
                                        <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                                            <CardHeader className="p-3.5 py-2.5 bg-slate-50/50 border-b">
                                                <CardTitle className="text-xs font-bold text-slate-700">고정 배정 학생</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-4 space-y-2.5">
                                                {specialStats.fixed.map((s, i) => (
                                                    <div key={i} className="flex justify-between items-center text-xs">
                                                        <div className="flex items-center gap-2">
                                                            <User size={14} className="text-slate-400" />
                                                            <span className="font-semibold text-slate-700">{s.name}</span>
                                                            <span className="text-slate-400">({s.target}반 희망)</span>
                                                        </div>
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] h-5 rounded-full px-2 ${s.isMet
                                                                ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                                                                : 'border-red-200 text-red-700 bg-red-50'
                                                                }`}
                                                        >
                                                            {s.isMet ? '만족' : '미충족'} ({s.class})
                                                        </Badge>
                                                    </div>
                                                ))}
                                                {specialStats.fixed.length === 0 && <p className="text-xs text-muted-foreground opacity-60">고정 배정 학생 없음</p>}
                                            </CardContent>
                                        </Card>

                                        <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                                            <CardHeader className="p-3.5 py-2.5 bg-slate-50/50 border-b">
                                                <CardTitle className="text-xs font-bold text-slate-700">전출 예정 학생</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-4">
                                                <div className="flex flex-wrap gap-1.5 text-xs">
                                                    {specialStats.preTransfer.map((s, i) => (
                                                        <span key={i} className="text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100 font-medium flex items-center gap-1">
                                                            <User size={12} className="text-indigo-400" />
                                                            {s.name} <span className="opacity-30">|</span> {s.class}
                                                        </span>
                                                    ))}
                                                    {specialStats.preTransfer.length === 0 && <span className="text-muted-foreground opacity-60">전출 예정 학생 없음</span>}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="movements" className="m-0 space-y-4">
                            <div className="flex justify-between items-center">
                                <p className="text-sm text-muted-foreground">최초 배정 결과 대비 <strong>{movementStats.length}명</strong>의 학생이 이동되었습니다.</p>
                            </div>

                            {movementStats.length === 0 ? (
                                <div className="text-center py-20 text-muted-foreground border border-dashed rounded-2xl bg-slate-50/50">
                                    <Info size={32} className="mx-auto mb-3 opacity-20" />
                                    <p className="text-sm">이동한 학생이 없습니다.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                    {movementStats.map((s, i) => (
                                        <div key={s.id} className="flex items-center justify-between p-4 px-5 text-sm hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-5">
                                                <span className="text-xs font-bold text-slate-300 w-5">{i + 1}</span>
                                                <div className="flex items-center gap-2">
                                                    <User size={16} className="text-slate-400" />
                                                    <span className="font-bold text-slate-700">{s.name}</span>
                                                    <Badge variant="secondary" className="text-[11px] px-1.5 h-5 font-normal text-slate-500 bg-slate-100 hover:bg-slate-200">
                                                        {s.prev_info.split('-').slice(0, 2).join('-')} 반
                                                    </Badge>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-tighter">최초</span>
                                                    <Badge variant="outline" className="font-semibold text-slate-500 bg-white border-slate-200 px-2 py-0.5 rounded-lg">
                                                        {s.initialClass}
                                                    </Badge>
                                                </div>
                                                <ArrowRight size={14} weight="bold" className="text-slate-300" />
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-medium text-indigo-400 uppercase tracking-tighter">최종</span>
                                                    <Badge className="bg-indigo-500 text-white font-bold border-none px-3 py-1 rounded-lg shadow-sm">
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
                                <div className="text-center py-20 text-muted-foreground border border-dashed rounded-2xl bg-slate-50/50">
                                    <Clock size={32} className="mx-auto mb-3 opacity-20" />
                                    <p className="text-sm font-medium">배정 변경 이력이 없습니다.</p>
                                    <p className="text-xs opacity-60 mt-1">자동 배정 이후의 수동 변경 사항이 여기에 표시됩니다.</p>
                                </div>
                            ) : (
                                <HistoryPanel history={history} students={students} />
                            )}
                        </TabsContent>
                    </div>

                    <div className="p-4 border-t px-6 flex justify-between bg-gray-50">
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
