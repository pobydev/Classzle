'use client';

import { useState, useMemo } from 'react';
import { useClasszleStore } from '@/lib/store';
import { assignStudents, calculateClassStats } from '@/lib/algorithm';
import { validateSwap } from '@/lib/validation';
import { exportToExcel } from '@/lib/excel';
import { calculateAttendanceNumbers } from '@/lib/numbering';
import { Student, Violation, BehaviorType, AssignmentChange } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface Step3DashboardProps {
    onBack: () => void;
}

// 학생 카드 컴포넌트
function StudentCard({
    student,
    groups,
    allStudents,
    isSelected,
    isHighlighted,
    isRecommended,
    showScore,
    attendanceNumber,
    onClick,
    onHoverRelation,
}: {
    student: Student;
    groups: { id: string; name: string; color: string }[];
    allStudents: Student[];
    isSelected: boolean;
    isHighlighted: boolean;
    isRecommended: boolean;
    showScore: boolean;
    attendanceNumber?: number;
    onClick: () => void;
    onHoverRelation: (studentIds: string[] | null) => void;
}) {
    const studentGroups = groups.filter((g) =>
        student.group_ids.includes(g.id)
    );

    const getBehaviorStyle = (type: BehaviorType, score: number) => {
        if (type === 'NONE') return 'bg-white border-gray-200';
        if (type === 'LEADER') {
            return score >= 2
                ? 'bg-green-100 border-green-300'
                : 'bg-green-50 border-green-200';
        }
        if (type === 'BEHAVIOR') {
            if (score <= -3) return 'bg-red-100 border-red-300';
            if (score <= -2) return 'bg-orange-100 border-orange-300';
            return 'bg-orange-50 border-orange-200';
        }
        if (type === 'EMOTIONAL') {
            if (score <= -3) return 'bg-blue-100 border-blue-300';
            if (score <= -2) return 'bg-blue-50 border-blue-200';
            return 'bg-sky-50 border-sky-200';
        }
        return 'bg-white border-gray-200';
    };

    // 관계 학생 정보 조회 (allStudents가 없을 경우 빈 배열)
    const avoidStudents = (allStudents || []).length > 0 && student.avoid_ids.length > 0
        ? student.avoid_ids.map(id => allStudents.find(s => s.id === id)).filter(Boolean) as Student[]
        : [];
    const keepStudents = (allStudents || []).length > 0 && student.keep_ids.length > 0
        ? student.keep_ids.map(id => allStudents.find(s => s.id === id)).filter(Boolean) as Student[]
        : [];

    return (
        <div
            onClick={onClick}
            className={`
        p-2 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between min-h-[42px]
        ${getBehaviorStyle(student.behavior_type, student.behavior_score)}
        ${isSelected ? 'ring-2 ring-primary ring-offset-2 scale-[1.02] shadow-md z-10' : ''}
        ${isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-1 bg-yellow-50 shadow-lg z-20' : ''}
        ${isRecommended ? 'ring-2 ring-indigo-400 ring-offset-1 shadow-md z-10 animate-pulse' : ''}
        ${!isSelected && !isHighlighted && !isRecommended ? 'hover:shadow-md hover:scale-[1.01]' : ''}
      `}
        >
            <div className="flex items-center gap-1.5 overflow-hidden">
                {attendanceNumber !== undefined && (
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {attendanceNumber}.
                    </span>
                )}
                <span className="font-medium text-sm truncate">{student.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                    ({student.gender === 'M' ? '남' : '여'})
                </span>
                {student.behavior_type !== 'NONE' && (
                    <span className="text-[10px] opacity-70 shrink-0">
                        {student.behavior_type === 'LEADER' && '🟢'}
                        {student.behavior_type === 'BEHAVIOR' && '🟠'}
                        {student.behavior_type === 'EMOTIONAL' && '🔵'}
                        {student.behavior_score > 0 ? `+${student.behavior_score}` : student.behavior_score}
                    </span>
                )}
                {showScore && (
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1 rounded border border-indigo-100 shrink-0">
                        {student.academic_score}점
                    </span>
                )}
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-1">
                {/* 관계 배지 - 피해야 할 관계 */}
                {avoidStudents.length > 0 && (
                    <div
                        className="relative group"
                        onMouseEnter={() => onHoverRelation(student.avoid_ids)}
                        onMouseLeave={() => onHoverRelation(null)}
                    >
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-200 border-red-200 text-[10px] px-1 py-0 h-5 cursor-help">
                            🚫{avoidStudents.length}
                        </Badge>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50">
                            <div className="bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                                <div className="font-semibold mb-0.5 text-red-300">피해야 할 학생</div>
                                {avoidStudents.map(s => {
                                    const classStudents = allStudents.filter(st => st.assigned_class === s.assigned_class).sort((a, b) => a.name.localeCompare(b.name));
                                    const studentNumber = classStudents.findIndex(st => st.id === s.id) + 1;
                                    // 이전 학년에서 +1, 새 반호수 추출, 새 번호
                                    const prevGrade = parseInt(s.prev_info.split('-')[0]) || 0;
                                    const newGrade = prevGrade + 1;
                                    const newClass = s.assigned_class ? s.assigned_class.replace('반', '') : '?';
                                    const newInfo = s.assigned_class ? `${newGrade}-${newClass}-${studentNumber}` : '미배정';
                                    return <div key={s.id}>{s.name} ({newInfo})</div>;
                                })}
                            </div>
                        </div>
                    </div>
                )}
                {/* 관계 배지 - 같은 반 희망 */}
                {keepStudents.length > 0 && (
                    <div
                        className="relative group"
                        onMouseEnter={() => onHoverRelation(student.keep_ids)}
                        onMouseLeave={() => onHoverRelation(null)}
                    >
                        <Badge className="bg-pink-100 text-pink-700 hover:bg-pink-200 border-pink-200 text-[10px] px-1 py-0 h-5 cursor-help">
                            💕{keepStudents.length}
                        </Badge>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50">
                            <div className="bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                                <div className="font-semibold mb-0.5 text-pink-300">같은 반 희망 학생</div>
                                {keepStudents.map(s => {
                                    const classStudents = allStudents.filter(st => st.assigned_class === s.assigned_class).sort((a, b) => a.name.localeCompare(b.name));
                                    const studentNumber = classStudents.findIndex(st => st.id === s.id) + 1;
                                    // 이전 학년에서 +1, 새 반호수 추출, 새 번호
                                    const prevGrade = parseInt(s.prev_info.split('-')[0]) || 0;
                                    const newGrade = prevGrade + 1;
                                    const newClass = s.assigned_class ? s.assigned_class.replace('반', '') : '?';
                                    const newInfo = s.assigned_class ? `${newGrade}-${newClass}-${studentNumber}` : '미배정';
                                    return <div key={s.id}>{s.name} ({newInfo})</div>;
                                })}
                            </div>
                        </div>
                    </div>
                )}
                {/* 기존 배지들 */}
                {(studentGroups.length > 0 || student.is_pre_transfer || student.fixed_class) && (
                    <div className="flex gap-1">
                        {student.fixed_class && (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200 text-[10px] px-1 py-0 h-5">
                                📌고정
                            </Badge>
                        )}
                        {student.is_pre_transfer && (
                            <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200 text-[10px] px-1 py-0 h-5">
                                전출
                            </Badge>
                        )}
                        {studentGroups.map((group) => (
                            <Badge key={group.id} className={`${group.color} text-[10px] px-1 py-0 h-5`}>
                                {group.name}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}


// 배정 결과 리포트 다이얼로그
function AssignmentReportDialog({
    open,
    onOpenChange,
    students,
    groups,
    history,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    students: Student[];
    groups: any[];
    history: AssignmentChange[];
}) {
    // 1. 관계 성취 현황 계산
    const relationStats = useMemo(() => {
        const stats = {
            keepTotal: 0,
            keepMet: 0,
            avoidTotal: 0,
            avoidMet: 0,
            details: [] as any[]
        };

        students.forEach(s => {
            // 같은 반 희망 학생들
            s.keep_ids.forEach(kid => {
                const partner = students.find(p => p.id === kid);
                if (partner && s.id < partner.id) { // 중복 방지
                    stats.keepTotal++;
                    const isSame = s.assigned_class === partner.assigned_class && s.assigned_class !== null;
                    if (isSame) stats.keepMet++;
                    stats.details.push({
                        type: 'keep',
                        names: [s.name, partner.name],
                        status: isSame ? '성공' : '미성취',
                        classes: [s.assigned_class || '미배정', partner.assigned_class || '미배정']
                    });
                }
            });

            // 피해야 할 학생들
            s.avoid_ids.forEach(aid => {
                const partner = students.find(p => p.id === aid);
                if (partner && s.id < partner.id) {
                    stats.avoidTotal++;
                    const isSame = s.assigned_class === partner.assigned_class && s.assigned_class !== null;
                    if (!isSame) stats.avoidMet++; // 같은 반이 아니면 성공
                    stats.details.push({
                        type: 'avoid',
                        names: [s.name, partner.name],
                        status: !isSame ? '성공' : '위반',
                        classes: [s.assigned_class || '미배정', partner.assigned_class || '미배정']
                    });
                }
            });
        });

        return stats;
    }, [students]);

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

    // 3. 특수 배정 (고정, 전출)
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
        // 기존 프레임이 있으면 제거
        const oldFrame = document.getElementById('print-frame');
        if (oldFrame) document.body.removeChild(oldFrame);

        // 새 비가시적 프레임 생성
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
            ? '<tr><td colspan="5" style="text-align:center; padding: 40px; color: #999;">변경 이력이 없습니다.</td></tr>'
            : history.map((c, i) => `
                <tr>
                    <td style="text-align:center;">${i + 1}</td>
                    <td style="text-align:center;">${c.source === 'auto' ? '자동' : '수동'}</td>
                    <td style="text-align:center; font-size: 11px;">${new Date(c.timestamp).toLocaleTimeString()}</td>
                    <td style="font-weight: bold;">
                        ${c.type === 'swap' ? `${c.studentName}<br>↔ ${c.partnerName}` : c.studentName}
                    </td>
                    <td>
                        ${c.type === 'swap'
                    ? `${c.studentName}: ${c.oldClass} → ${c.newClass}<br>${c.partnerName}: ${c.newClass} → ${c.oldClass}`
                    : `${c.oldClass || '미배정'} → ${c.newClass || '미배정'}`
                }
                    </td>
                </tr>
            `).join('');

        const groupHtml = groupStats.length === 0
            ? '<p style="color: #999; margin-left: 10px; font-size: 11pt;">설정된 분산 배정 그룹이 없습니다.</p>'
            : groupStats.map(g => `
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 11pt; color: #333;">• ${g.name}</strong>
                    <div style="margin-top: 5px; padding-left: 15px; font-size: 10pt; line-height: 1.6;">
                        ${g.students.length === 0
                    ? '<span style="color: #999;">멤버 없음</span>'
                    : g.students.map(s => `${s.name} (${s.class})`).join(', ')
                }
                    </div>
                </div>
            `).join('');

        const relationHtml = relationStats.details.length === 0
            ? '<p style="color: #999; margin-left: 10px; font-size: 11pt;">설정된 관계 조건이 없습니다.</p>'
            : `
            <table style="width: 100%; border-collapse: collapse; margin-top: 5px;">
                <thead>
                    <tr style="background-color: #f5f5f5;">
                        <th style="width: 60px;">구분</th>
                        <th>대상 학생</th>
                        <th>배정 결과 (반)</th>
                        <th style="width: 60px;">상태</th>
                    </tr>
                </thead>
                <tbody>
                    ${relationStats.details.map(d => `
                        <tr>
                            <td style="text-align:center;">${d.type === 'keep' ? '희망' : '회피'}</td>
                            <td>${d.names.join(', ')}</td>
                            <td style="text-align:center;">${d.classes.join(', ')}</td>
                            <td style="text-align:center; font-weight: bold; color: ${d.status === '성공' ? '#2e7d32' : '#d32f2f'}">${d.status}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        const specialHtml = `
            <div style="padding: 10px; border: 1px solid #333; border-radius: 4px;">
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 11pt; color: #333;">• 고정 배정 학생</strong>
                    <div style="margin-top: 5px; padding-left: 15px;">
                        ${specialStats.fixed.length === 0
                ? '<span style="color: #999; font-size: 10pt;">고정 학생 없음</span>'
                : specialStats.fixed.map(s => `
                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 10pt;">
                                    <span>${s.name} (${s.target} 희망)</span>
                                    <span style="color: ${s.isMet ? '#2e7d32' : '#d32f2f'}; font-weight: bold; font-size: 9pt;">
                                        ${s.isMet ? `성공(${s.class})` : `위반(${s.class})`}
                                    </span>
                                </div>
                            `).join('')}
                    </div>
                </div>
                <div style="margin-top: 15px; border-top: 1px dashed #eee; padding-top: 15px;">
                    <strong style="font-size: 11pt; color: #333;">• 전출 예정 학생</strong>
                    <div style="margin-top: 5px; padding-left: 15px; font-size: 10pt; line-height: 1.6;">
                        ${specialStats.preTransfer.length === 0
                ? '<span style="color: #999;">전출 학생 없음</span>'
                : specialStats.preTransfer.map(s => `${s.name} (${s.class})`).join(', ')
            }
                    </div>
                </div>
            </div>
        `;

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>반 배정 결과 보고서</title>
                    <style>
                    @page { size: A4; margin: 20mm; }
                    body { font-family: sans-serif; margin: 0; padding: 0; line-height: 1.5; color: #333; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .header h1 { font-size: 24pt; margin: 0; }
                    .header p { text-align: right; font-size: 10pt; color: #666; }
                    h2 { font-size: 16pt; border-bottom: 2px solid #333; padding-bottom: 5px; margin-top: 30px; page-break-after: avoid; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
                    th, td { border: 1px solid #333; padding: 8px; font-size: 11pt; word-break: break-all; vertical-align: middle; }
                    th { background-color: #f5f5f5; font-weight: bold; }
                    tr { page-break-inside: avoid; }
                        .summary-table th {width: 40%; }
                    .summary-table td { text-align: center; }
                        .history-table th:nth-child(1) {width: 40px; }
                        .history-table th:nth-child(2) {width: 60px; }
                        .history-table th:nth-child(3) {width: 100px; }
                        .history-table th:nth-child(4) {width: 150px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <p>출력일시: ${new Date().toLocaleString()}</p>
                        <h1>반 배정 결과 보고서</h1>
                    </div>

                    <h2>1. 조건 성취 요약</h2>
                    <table class="summary-table">
                        <thead>
                            <tr>
                                <th>평가 항목</th>
                                <th>성취 / 전체</th>
                                <th>성취율 (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>같은 반 희망</td>
                                <td>${relationStats.keepMet} / ${relationStats.keepTotal}</td>
                                <td>${relationStats.keepTotal > 0 ? Math.round((relationStats.keepMet / relationStats.keepTotal) * 100) : 100}%</td>
                            </tr>
                            <tr>
                                <td>피해야 할 관계</td>
                                <td>${relationStats.avoidMet} / ${relationStats.avoidTotal}</td>
                                <td>${relationStats.avoidTotal > 0 ? Math.round((relationStats.avoidMet / relationStats.avoidTotal) * 100) : 100}%</td>
                            </tr>
                            <tr>
                                <td>고정 배정 준수</td>
                                <td>${specialStats.fixed.filter(s => s.isMet).length} / ${specialStats.fixed.length}</td>
                                <td>${specialStats.fixed.length > 0 ? Math.round((specialStats.fixed.filter(s => s.isMet).length / specialStats.fixed.length) * 100) : 100}%</td>
                            </tr>
                        </tbody>
                    </table>

                    <h3 style="margin-top: 15px; font-size: 13pt;">🔗 관계별 상세 배정 정보</h3>
                    ${relationHtml}

                    <h2>2. 분산 배정 그룹 및 특수 배정 현황</h2>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div style="padding: 10px; border: 1px solid #333; border-radius: 4px;">
                            ${groupHtml}
                        </div>
                        ${specialHtml}
                    </div>

                    <h2>3. 누적 변경 이력 (총 ${history.length}건)</h2>
                    <table class="history-table">

                        <thead>
                            <tr>
                                <th>No</th>
                                <th>구분</th>
                                <th>시간</th>
                                <th>대상 학생</th>
                                <th>상세 변경 내용</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${historyHtml}
                        </tbody>
                    </table>

                    <div style="margin-top: 50px; text-align: center; font-size: 9pt; color: #999;">
                        Classzle - 완벽한 반 편성을 위한 마지막 조각
                    </div>
                </body>
            </html>
        `;

        if (window.electronAPI) {
            window.electronAPI.printPreview(html);
        } else {
            // 기존 방식: iframe 사용 (웹 환경)
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
                // 웹 프린트용 스크립트 추가
                const webHtml = html.replace('</body>', `
                    <script>
                        window.onload = function() {
                            window.print();
                        };
                    </script>
                    </body>
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
                        📊 배정 결과 상세 리포트
                    </DialogTitle>
                    <DialogDescription>학급 배정 결과를 상세히 확인하세요.</DialogDescription>
                </DialogHeader>


                <Tabs defaultValue="fulfillment" className="flex-1 overflow-hidden flex flex-col">
                    <div className="px-6 border-b">
                        <TabsList className="w-full justify-start h-12 bg-transparent gap-6 p-0">
                            <TabsTrigger
                                value="fulfillment"
                                className="h-full border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-2"
                            >
                                조건 성취 현황
                            </TabsTrigger>
                            <TabsTrigger
                                value="history"
                                className="h-full border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-2"
                            >
                                누적 변경 이력 ({history.length})
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        <TabsContent value="fulfillment" className="m-0 space-y-6">
                            {/* 관계 성취 요약 */}
                            <div className="grid grid-cols-2 gap-4">
                                <Card className="bg-pink-50/30 border-pink-100 flex flex-col items-center justify-center text-center py-4 rounded-xl shadow-sm">
                                    <div className="text-sm font-medium text-pink-700 mb-1">💕 같은 반 희망</div>
                                    <div className="text-2xl font-bold text-pink-600">
                                        {relationStats.keepMet} / {relationStats.keepTotal}
                                    </div>
                                    <p className="text-xs text-pink-600/70">커플 성취율: {relationStats.keepTotal > 0 ? Math.round((relationStats.keepMet / relationStats.keepTotal) * 100) : 100}%</p>
                                </Card>
                                <Card className="bg-red-50/30 border-red-100 flex flex-col items-center justify-center text-center py-4 rounded-xl shadow-sm">
                                    <div className="text-sm font-medium text-red-700 mb-1">🚫 피해야 할 관계</div>
                                    <div className="text-2xl font-bold text-red-600">
                                        {relationStats.avoidMet} / {relationStats.avoidTotal}
                                    </div>
                                    <p className="text-xs text-red-600/70">분리 성공률: {relationStats.avoidTotal > 0 ? Math.round((relationStats.avoidMet / relationStats.avoidTotal) * 100) : 100}%</p>
                                </Card>
                            </div>

                            {/* 관계 상세 내역 */}
                            <Card className="rounded-xl border-indigo-100 shadow-md shadow-indigo-500/5 bg-white">
                                <CardHeader className="py-3 border-b bg-muted/20">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">🔗 관계별 상세 배정 정보</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-gray-100">
                                        {relationStats.details.length === 0 ? (
                                            <div className="p-8 text-center text-muted-foreground text-sm">설정된 관계 조건이 없습니다.</div>
                                        ) : relationStats.details.map((detail, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 text-sm">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="outline" className={detail.type === 'keep' ? 'border-pink-200 text-pink-700 bg-pink-50' : 'border-red-200 text-red-700 bg-red-50'}>
                                                        {detail.type === 'keep' ? '💕 희망' : '🚫 회피'}
                                                    </Badge>
                                                    <span className="font-medium">
                                                        {detail.names.map((name: string, i: number) => (
                                                            <span key={i}>
                                                                {name} <span className="text-muted-foreground font-normal text-xs">({detail.classes[i]})</span>
                                                                {i < detail.names.length - 1 ? ', ' : ''}
                                                            </span>
                                                        ))}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <Badge variant={detail.status === '성공' ? 'default' : 'destructive'} className="w-16 justify-center">
                                                        {detail.status}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* 커스텀 그룹 및 특수 배정 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* 커스텀 그룹 */}
                                <div className="space-y-4">
                                    <h4 className="font-bold text-sm flex items-center gap-2">👥 그룹 학생 배정 정보</h4>
                                    <div className="space-y-3">
                                        {groupStats.map(g => (
                                            <Card key={g.name} className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
                                                <CardHeader className="p-3 py-2 bg-muted/10 border-b flex flex-row items-center gap-2">
                                                    <div className={`w-1 h-3 rounded-full ${g.color || 'bg-primary'}`} />
                                                    <CardTitle className="text-xs font-bold">{g.name}</CardTitle>
                                                </CardHeader>
                                                <CardContent className="p-3">
                                                    <div className="flex flex-wrap gap-2 text-xs">
                                                        {g.students.map((s, i) => (
                                                            <span key={i} className="bg-gray-100 px-2 py-1 rounded">
                                                                {s.name} ({s.class})
                                                            </span>
                                                        ))}
                                                        {g.students.length === 0 && <span className="text-muted-foreground">멤버 없음</span>}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                    {groupStats.length === 0 && <p className="text-sm text-muted-foreground">생성된 그룹이 없습니다.</p>}
                                </div>

                                {/* 고정/전출 */}
                                <div className="space-y-4">
                                    <h4 className="font-bold text-sm flex items-center gap-2">📌 고정 및 전출 예정 확인</h4>
                                    <div className="space-y-4">
                                        <Card>
                                            <CardHeader className="p-3 py-2 bg-muted/10 border-b">
                                                <CardTitle className="text-xs font-bold">고정 배정 학생</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-3 space-y-2">
                                                {specialStats.fixed.map((s, i) => (
                                                    <div key={i} className="flex justify-between items-center text-xs">
                                                        <span>{s.name} ({s.target} 희망)</span>
                                                        <Badge variant={s.isMet ? 'outline' : 'destructive'} className="text-[10px] h-5">
                                                            {s.isMet ? `성공(${s.class})` : `위반(${s.class})`}
                                                        </Badge>
                                                    </div>
                                                ))}
                                                {specialStats.fixed.length === 0 && <p className="text-xs text-muted-foreground">고정 학생 없음</p>}
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardHeader className="p-3 py-2 bg-muted/10 border-b">
                                                <CardTitle className="text-xs font-bold">전출 예정 학생</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-3">
                                                <div className="flex flex-wrap gap-2 text-xs">
                                                    {specialStats.preTransfer.map((s, i) => (
                                                        <span key={i} className="text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-100">
                                                            {s.name} ({s.class})
                                                        </span>
                                                    ))}
                                                    {specialStats.preTransfer.length === 0 && <span className="text-muted-foreground">전출 학생 없음</span>}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="history" className="m-0">
                            {history.length === 0 ? (
                                <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
                                    <div className="text-4xl mb-4">📜</div>
                                    <p className="text-sm">배정 변경 이력이 없습니다.</p>
                                    <p className="text-xs opacity-60 mt-1">배정 실행 후나 수동 이동 시 기록이 남습니다.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col h-full">
                                    {/* 고정 헤더 - 스크롤 영역 밖 */}
                                    <div className="pb-3 flex justify-between items-center border-b bg-white">
                                        <p className="text-sm text-muted-foreground">총 <strong>{history.length}</strong>건의 이동 내역</p>
                                        <p className="text-xs text-muted-foreground">이력은 '신규 배정' 시 초기화됩니다.</p>
                                    </div>
                                    {/* 스크롤 가능한 리스트 영역 */}
                                    <div className="divide-y divide-gray-100 border rounded-lg mt-3 overflow-y-auto max-h-[400px]">
                                        {history.map((change, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 px-4 text-sm hover:bg-gray-50 transition-colors">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold ${change.type === 'swap' ? 'text-indigo-700' : 'text-primary'}`}>
                                                            {idx + 1}. {change.type === 'swap' ? '[교환] ' : ''}
                                                            {change.studentName}
                                                            {change.type === 'swap' && ` ↔ ${change.partnerName}`}
                                                        </span>
                                                        <Badge variant="secondary" className={`text-[10px] h-4 px-1 ${change.source === 'auto' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                                                            {change.source === 'auto' ? '자동' : '수동'}
                                                        </Badge>
                                                    </div>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {new Date(change.timestamp).toLocaleTimeString()}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    {change.type === 'swap' ? (
                                                        <div className="flex flex-col items-end gap-1">
                                                            <div className="flex items-center gap-2 text-[11px]">
                                                                <span className="text-muted-foreground">{change.studentName}:</span>
                                                                <span className="line-through opacity-50">{change.oldClass}</span>
                                                                <span className="font-bold text-indigo-600">→ {change.newClass}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[11px]">
                                                                <span className="text-muted-foreground">{change.partnerName}:</span>
                                                                <span className="line-through opacity-50">{change.newClass}</span>
                                                                <span className="font-bold text-indigo-600">→ {change.oldClass}</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <Badge variant="outline" className="text-muted-foreground font-normal line-through opacity-50 h-6 px-1.5">
                                                                {change.oldClass || '미배정'}
                                                            </Badge>
                                                            <span className="text-muted-foreground">→</span>
                                                            <Badge className="bg-indigo-600 font-bold h-6 px-1.5">
                                                                {change.newClass || '미배정'}
                                                            </Badge>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </TabsContent>
                    </div>

                    <div className="p-4 border-t px-6 flex justify-between bg-gray-50">
                        <Button
                            variant="outline"
                            onClick={handlePrint}
                            className="gap-2"
                        >
                            🖨️ 리포트 인쇄
                        </Button>
                        <Button onClick={() => onOpenChange(false)}>확인 및 닫기</Button>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

export default function Step3Dashboard({ onBack }: Step3DashboardProps) {
    const {
        students, groups, settings, setStudents,
        assignStudentToClass, swapStudents,
        movementHistory, addMovements, clearMovements,
        setNumberingMethod
    } = useClasszleStore();
    const [violations, setViolations] = useState<Violation[]>([]);
    const [isAssigning, setIsAssigning] = useState(false);

    const [activeRelationIds, setActiveRelationIds] = useState<string[] | null>(null);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [pendingSwap, setPendingSwap] = useState<{ s1Id: string, s2Id: string, violations: Violation[] } | null>(null);

    // 리포트 다이얼로그 상태
    const [isReportOpen, setIsReportOpen] = useState(false);

    // 배정 모드 상태 ('new' | 'optimize')
    const [assignmentMode, setAssignmentMode] = useState<'new' | 'optimize'>('new');

    const handleClassHeaderClick = (className: string) => {
        handleMoveToClass(className);
    };

    const classNames = useMemo(
        () => Array.from({ length: settings.classCount }, (_, i) => `${i + 1}반`),
        [settings.classCount]
    );

    const classStats = useMemo(
        () => calculateClassStats(students, settings.classCount, groups),
        [students, settings.classCount, groups]
    );

    const studentsByClass = useMemo(() => {
        const result: Record<string, Student[]> = {};
        classNames.forEach((cn) => {
            result[cn] = students
                .filter((s) => s.assigned_class === cn)
                .sort((a, b) => {
                    // 0. 전출 예정 여부 (일반 -> 전출)
                    // 전출 학생은 맨 뒤 출석번호
                    const aPre = a.is_pre_transfer ? 1 : 0;
                    const bPre = b.is_pre_transfer ? 1 : 0;
                    if (aPre !== bPre) return aPre - bPre;

                    if (settings.numberingMethod === 'mixed') {
                        // 1. 이름 (가나다순) - 남녀 혼합
                        return a.name.localeCompare(b.name, 'ko');
                    } else if (settings.numberingMethod === 'maleFirst') {
                        // 남학생 -> 여학생
                        if (a.gender !== b.gender) return a.gender === 'M' ? -1 : 1;
                        return a.name.localeCompare(b.name, 'ko');
                    } else {
                        // 여학생 -> 남학생
                        if (a.gender !== b.gender) return a.gender === 'F' ? -1 : 1;
                        return a.name.localeCompare(b.name, 'ko');
                    }
                });
        });
        result['미배정'] = students
            .filter((s) => !s.assigned_class)
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        return result;
    }, [students, classNames, settings.numberingMethod]);

    // 반별 출석번호 계산 (Memoized)
    const attendanceNumbersByClass = useMemo(() => {
        const result: Record<string, Record<string, number>> = {};
        classNames.forEach((cn) => {
            result[cn] = calculateAttendanceNumbers(
                students.filter(s => s.assigned_class === cn),
                settings.numberingMethod || 'mixed'
            );
        });
        // 미배정 학생은 단순 순번
        const unassignedStudents = students.filter(s => !s.assigned_class).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        result['미배정'] = {};
        unassignedStudents.forEach((s, idx) => {
            result['미배정'][s.id] = idx + 1;
        });
        return result;
    }, [students, classNames, settings.numberingMethod]);

    const handleAssign = () => {
        setIsAssigning(true);
        // 신규 배정일 경우 이력 초기화
        if (assignmentMode === 'new') {
            clearMovements();
        }

        // 현재 상태 캡처 (Deep Copy to avoid reference issues)
        const beforeStudents = JSON.parse(JSON.stringify(students)) as Student[];

        setTimeout(() => {
            // 알고리즘 실행
            const result = assignStudents(
                students,
                settings.classCount,
                groups,
                settings.scoreTolerance,
                assignmentMode,
                settings.useAdvancedConstraints
            );

            // 1차 변경 내역 추출 (단순 이동 리스트)
            const rawChanges: AssignmentChange[] = [];
            result.students.forEach(newStudent => {
                const oldStudent = beforeStudents.find(s => s.id === newStudent.id);
                if (oldStudent && oldStudent.assigned_class !== newStudent.assigned_class) {
                    rawChanges.push({
                        studentId: newStudent.id,
                        studentName: newStudent.name,
                        oldClass: oldStudent.assigned_class || null,
                        newClass: newStudent.assigned_class || null,
                        timestamp: Date.now(),
                        type: 'move',
                        source: 'auto'
                    });
                }
            });

            // 2차 가공: 교환(Swap) 쌍 검출 및 병합
            const changes: AssignmentChange[] = [];
            const processedIndices = new Set<number>();

            for (let i = 0; i < rawChanges.length; i++) {
                if (processedIndices.has(i)) continue;

                let isSwapped = false;
                for (let j = i + 1; j < rawChanges.length; j++) {
                    if (processedIndices.has(j)) continue;

                    const c1 = rawChanges[i];
                    const c2 = rawChanges[j];

                    // 상호 교환 조건 확인 (A->B, B->A)
                    if (
                        c1.oldClass === c2.newClass &&
                        c1.newClass === c2.oldClass &&
                        c1.oldClass !== null &&
                        c1.newClass !== null
                    ) {
                        changes.push({
                            ...c1,
                            type: 'swap',
                            source: 'auto',
                            partnerName: c2.studentName,
                            partnerId: c2.studentId
                        });
                        processedIndices.add(i);
                        processedIndices.add(j);
                        isSwapped = true;
                        break;
                    }
                }

                if (!isSwapped) {
                    changes.push({
                        ...rawChanges[i],
                        source: 'auto'
                    });
                    processedIndices.add(i);
                }
            }

            // 스토어 업데이트
            setStudents(result.students);
            if (assignmentMode !== 'new') {
                addMovements(changes); // '현재 배정 수정'일 때만 이력 추가
            }
            setViolations(result.violations);
            setIsAssigning(false);

            setIsReportOpen(true); // 결과 리포트 열기

            if (changes.length > 0) {
                toast.success(`${changes.length}명의 학생 배정이 변경되었습니다.`);
            } else {
                toast.info('배정 변경 사항이 없습니다 (이미 최적 상태).');
            }
        }, 100);
    };

    const handleExport = () => {
        setIsExportDialogOpen(true);
    };

    const confirmExport = (includeDetails: boolean) => {
        const timestamp = new Date().toISOString().split('T')[0];
        exportToExcel(students, settings.classCount, `반편성_결과_${timestamp}.xlsx`, {
            includeDetails: true,
            groups,
            numberingMethod: settings.numberingMethod
        });
        setIsExportDialogOpen(false);
    };
    // 추천 교환 대상 학생 ID 목록
    const recommendedStudentIds = useMemo(() => {
        if (!selectedStudentId) return [];
        const s1 = students.find(s => s.id === selectedStudentId);
        if (!s1 || !s1.assigned_class) return [];

        return students.filter(s2 => {
            // 다른 반 학생만 대상
            if (!s2.assigned_class || s2.assigned_class === s1.assigned_class) return false;

            // 1. 성적 유사성 체크 (설정된 Tolerance 이내)
            const scoreDiff = Math.abs(s1.academic_score - s2.academic_score);
            if (scoreDiff > settings.scoreTolerance) return false;

            // 2. 제약 조건 위반 여부 체크 (위반 사항이 없어야 추천)
            const violations = validateSwap(selectedStudentId, s2.id, students);
            return violations.length === 0;
        }).map(s => s.id);
    }, [selectedStudentId, students, settings.scoreTolerance]);

    const handleStudentClick = (id: string) => {
        if (!selectedStudentId) {
            setSelectedStudentId(id);
        } else if (selectedStudentId === id) {
            setSelectedStudentId(null);
        } else {
            // 다른 학생 클릭 시 교환(Swap) 시도
            const s1 = students.find(s => s.id === selectedStudentId);
            const s2 = students.find(s => s.id === id);

            if (s1 && s2 && s1.assigned_class && s2.assigned_class && s1.assigned_class !== s2.assigned_class) {
                // 교환 전 위반 사항 체크
                const violations = validateSwap(selectedStudentId, id, students);

                if (violations.length > 0) {
                    // 위반 사항이 있으면 경고 다이얼로그 띄움
                    setPendingSwap({ s1Id: selectedStudentId, s2Id: id, violations });
                } else {
                    // 위반 사항 없으면 바로 교환
                    swapStudents(selectedStudentId, id);
                    setSelectedStudentId(null);
                    toast.success('학생 배정이 성공적으로 교차 변경되었습니다.');
                }
            } else if (s1 && s2 && s1.assigned_class === s2.assigned_class) {
                // 같은 반 학생을 클릭하면 선택 변경
                setSelectedStudentId(id);
            } else {
                setSelectedStudentId(id);
            }
        }
    };

    const confirmSwap = () => {
        if (pendingSwap) {
            swapStudents(pendingSwap.s1Id, pendingSwap.s2Id);
            setPendingSwap(null);
            setSelectedStudentId(null);
            toast.success('제약 조건을 무시하고 학생을 교차 변경했습니다.');
        }
    };

    const handleMoveToClass = (className: string | null) => {
        if (selectedStudentId) {
            assignStudentToClass(selectedStudentId, className);
            setSelectedStudentId(null);
            toast.success(`${className || '미배정'} 구역으로 이동했습니다.`);
        }
    };

    const selectedStudent = selectedStudentId
        ? students.find((s) => s.id === selectedStudentId)
        : null;

    const hasAssignments = students.some((s) => s.assigned_class);

    return (
        <div className="space-y-6">
            <AssignmentReportDialog
                open={isReportOpen}
                onOpenChange={setIsReportOpen}
                students={students}
                groups={groups}
                history={movementHistory}
            />

            {/* 통계 헤더 */}
            <Card className="rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/50 backdrop-blur">
                <CardHeader className="pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        {/* 왼쪽: 배정 모드 선택 */}
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1 px-1">배정 모드 선택</span>
                                <Tabs
                                    value={assignmentMode}
                                    onValueChange={(v) => setAssignmentMode(v as 'new' | 'optimize')}
                                    className="w-[280px]"
                                >
                                    <TabsList className="grid w-full grid-cols-2 h-11 bg-slate-100/50 p-1">
                                        <TabsTrigger value="new" className="text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm">
                                            🚀 신규 배정
                                        </TabsTrigger>
                                        <TabsTrigger value="optimize" className="text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm">
                                            🛠️ 현재 배정 수정
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>
                        </div>

                        {/* 오른쪽: 실행 버튼 그룹 */}
                        <div className="flex items-end gap-2 flex-wrap justify-end h-full pt-4">
                            <Button
                                onClick={handleAssign}
                                disabled={isAssigning || students.length === 0}
                                className={`h-10 px-5 font-bold shadow-md transition-all active:scale-95 bg-indigo-600 hover:bg-indigo-700`}
                            >
                                {isAssigning
                                    ? '배정 중...'
                                    : hasAssignments
                                        ? '🔄 배정 실행'
                                        : '🚀 반편성 시작'}
                            </Button>

                            <div className="h-11 w-px bg-slate-200 mx-1" /> {/* 구분선 */}

                            <Button
                                variant="outline"
                                onClick={() => setIsReportOpen(true)}
                                disabled={students.length === 0}
                                className="h-10 px-4 border-slate-200 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                            >
                                <span className="mr-2 text-base">📊</span> 배정 리포트
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleExport}
                                disabled={!hasAssignments}
                                className="h-10 px-4 border-slate-200 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                            >
                                <span className="mr-2 text-base">📥</span> 배정 결과 엑셀
                            </Button>
                        </div>
                    </div>

                    {/* 배정 모드 설명 문구 */}
                    <div className="mt-4 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 border-dashed text-[13px] text-muted-foreground leading-relaxed">
                        {assignmentMode === 'new' ? (
                            <p className="flex items-center gap-2">
                                <span className="text-primary font-bold">신규 배정:</span>
                                <span>성적순(S자) 배정을 기초로 모든 조건(성별·생활지도·성적·학생 관계 등)을 고려하여 처음부터 새로 편성합니다.</span>
                            </p>
                        ) : (
                            <p className="flex items-center gap-2">
                                <span className="text-indigo-600 font-bold">현재 배정 수정:</span>
                                <span>현재 배정 정보를 유지하면서, 제약 조건(관계, 균형 등)에 어긋나는 부분만 정교하게 조정합니다.</span>
                            </p>
                        )}
                    </div>
                </CardHeader>
            </Card>
            {/* 메인 탭 구성 */}
            <Tabs defaultValue="stats" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-12 mb-6">
                    <TabsTrigger value="stats" className="text-sm font-medium">📊 학급별 균형 통계</TabsTrigger>
                    <TabsTrigger value="board" className="text-sm font-medium">📋 상세 배치 조정</TabsTrigger>
                </TabsList>

                <TabsContent value="board" className="space-y-6 outline-none">
                    {/* 배정 작업 안내 */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-sm font-medium text-primary flex items-center gap-2 bg-primary/5 px-3 py-2 rounded-md border border-primary/10">
                            <span className="text-lg">🖱️</span>
                            <span>학생을 클릭하여 선택한 후, 이동할 반을 클릭하거나 다른 학생과 교환하세요.</span>
                        </div>

                        <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                            <label className="text-xs font-bold text-slate-500 whitespace-nowrap">번호 부여 방식</label>
                            <Select
                                value={settings.numberingMethod}
                                onValueChange={(v) => setNumberingMethod(v as any)}
                            >
                                <SelectTrigger className="w-[150px] h-9 bg-white border-slate-200 focus:ring-primary/20 text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="mixed">성별 혼합</SelectItem>
                                    <SelectItem value="maleFirst">남학생 → 여학생</SelectItem>
                                    <SelectItem value="femaleFirst">여학생 → 남학생</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* 미배정 영역 (상단 배치) */}
                    <Card className={`rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/80 backdrop-blur border-dashed overflow-hidden p-0 ${selectedStudentId ? 'ring-2 ring-primary/50 cursor-pointer hover:bg-muted/50 transition-all' : ''}`}>
                        <CardHeader className="py-3 px-4 bg-indigo-50/30 border-b cursor-pointer" onClick={() => handleMoveToClass(null)}>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    미배정 학생
                                    <Badge variant="secondary" className="text-xs">
                                        {studentsByClass['미배정'].length}명
                                    </Badge>
                                </CardTitle>
                                {selectedStudentId && (
                                    <span className="text-xs text-primary animate-pulse">
                                        클릭하여 선택된 학생을 미배정으로 이동하기
                                    </span>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-4">
                            {studentsByClass['미배정'].length === 0 ? (
                                <p className="text-center text-xs text-muted-foreground py-2">대기 중인 미배정 학생이 없습니다.</p>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                                    {studentsByClass['미배정']
                                        .map((s) => (
                                            <StudentCard
                                                key={s.id}
                                                student={s}
                                                groups={groups}
                                                allStudents={students}
                                                isSelected={selectedStudentId === s.id}
                                                isHighlighted={activeRelationIds?.includes(s.id) || false}
                                                isRecommended={recommendedStudentIds.includes(s.id)}
                                                showScore={!!selectedStudentId && (selectedStudentId === s.id || recommendedStudentIds.includes(s.id))}
                                                attendanceNumber={attendanceNumbersByClass['미배정']?.[s.id]}
                                                onClick={() => handleStudentClick(s.id)}
                                                onHoverRelation={setActiveRelationIds}
                                            />
                                        ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* 각 반 영역 (그리드 보드) */}
                    <div className={`grid gap-4 ${settings.classCount <= 4 ? `grid-cols-${settings.classCount}` : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5'}`}>
                        {classNames.map((className) => (
                            <Card key={className} className={`h-full rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/80 backdrop-blur overflow-hidden p-0 ${selectedStudentId ? 'ring-2 ring-primary/50 cursor-pointer hover:bg-muted/50 transition-all' : ''}`}>
                                <CardHeader className="py-3 px-4 bg-indigo-50/50 border-b cursor-pointer" onClick={() => handleClassHeaderClick(className)}>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-sm font-bold text-primary">{className}</CardTitle>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-xs">
                                                {studentsByClass[className].length}명
                                            </Badge>
                                            {selectedStudentId && (
                                                <span className="text-[10px] text-primary flex items-center animate-pulse">
                                                    여기로 ↵
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-2 min-h-[200px]">
                                    <div className="space-y-2">
                                        {studentsByClass[className]
                                            .map((s) => (
                                                <StudentCard
                                                    key={s.id}
                                                    student={s}
                                                    groups={groups}
                                                    allStudents={students}
                                                    isSelected={selectedStudentId === s.id}
                                                    isHighlighted={activeRelationIds?.includes(s.id) || false}
                                                    isRecommended={recommendedStudentIds.includes(s.id)}
                                                    showScore={!!selectedStudentId && (selectedStudentId === s.id || recommendedStudentIds.includes(s.id))}
                                                    attendanceNumber={attendanceNumbersByClass[className]?.[s.id]}
                                                    onClick={() => handleStudentClick(s.id)}
                                                    onHoverRelation={setActiveRelationIds}
                                                />
                                            ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="stats" className="outline-none">
                    <Card className="rounded-xl border-indigo-100 shadow-sm bg-white/50 overflow-hidden">
                        <CardContent className="pt-5">
                            <div className="mb-6 p-4 bg-indigo-50 rounded-lg text-sm text-slate-700 leading-relaxed border border-indigo-100/50">
                                💡 <strong>생활지도 점수 총점의 의미</strong>: 학급 경영 난이도를 예측하는 참고 지표입니다. 점수가 낮을수록 교사의 세심한 생활지도가 요구되며, 높을수록 비교적 안정적인 학급 운영이 기대됩니다.
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-muted">
                                            <th className="p-3 text-left font-semibold">반</th>
                                            <th className="p-3 text-center font-semibold">인원</th>
                                            <th className="p-3 text-center font-semibold">평균</th>
                                            <th className="p-3 text-center font-semibold">남/여</th>
                                            <th className="p-3 text-center font-semibold text-slate-700">생활지도 점수별 학생수</th>
                                            <th className="p-3 text-center font-semibold text-slate-700">생활지도 점수 총점</th>
                                            {groups.length > 0 && <th className="p-3 text-center font-semibold text-slate-700">분산 배정 그룹</th>}
                                            <th className="p-3 text-center font-semibold">전출(남/여)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {classStats.map((stat) => (
                                            <tr key={stat.className} className="border-b hover:bg-muted/30">
                                                <td className="p-3 font-bold">{stat.className}</td>
                                                <td className="p-3 text-center">{stat.studentCount}</td>
                                                <td className="p-3 text-center">{stat.averageScore}</td>
                                                <td className="p-3 text-center text-muted-foreground">{stat.maleCount}/{stat.femaleCount}</td>
                                                <td className="p-3">
                                                    <div className="flex items-center justify-center gap-4">
                                                        {/* 행동/정서 (-3, -2, -1) 2단 구성 */}
                                                        <div className="flex flex-col gap-1.5 justify-center">
                                                            {/* 행동형 행 */}
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#ef4444] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-3</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-red-600">{stat.behaviorPlus3}</span>
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#f97316] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-2</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-orange-600">{stat.behaviorPlus2}</span>
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#fb923c] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-1</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-orange-500">{stat.behaviorPlus1}</span>
                                                                </div>
                                                            </div>
                                                            {/* 정서형 행 */}
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#4f46e5] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-3</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-indigo-600">{stat.emotionalPlus3}</span>
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#3b82f6] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-2</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-blue-600">{stat.emotionalPlus2}</span>
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#60a5fa] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-1</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-sky-500">{stat.emotionalPlus1}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* 일반(0) */}
                                                        <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-full border border-slate-100">
                                                            <Badge variant="outline" className="bg-slate-200 text-slate-600 border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[10px] font-bold">0</Badge>
                                                            <span className="text-[11px] font-bold text-slate-600">{stat.normalCount}</span>
                                                        </div>

                                                        {/* 리더 (+1, +2) */}
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex items-center gap-1">
                                                                <Badge variant="outline" className="bg-[#22c55e] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">+1</Badge>
                                                                <span className="text-[11px] font-semibold text-green-700">{stat.scorePlus1}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <Badge variant="outline" className="bg-[#059669] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">+2</Badge>
                                                                <span className="text-[11px] font-semibold text-emerald-800">{stat.scorePlus2}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className={`p-3 text-center font-bold ${stat.behaviorTotal < -5 ? 'text-red-500' : stat.behaviorTotal < 0 ? 'text-orange-500' : 'text-green-600'}`}>
                                                    {stat.behaviorTotal > 0 ? '+' : ''}{stat.behaviorTotal}
                                                </td>
                                                {groups.length > 0 && (
                                                    <td className="p-3 text-center text-xs">
                                                        {groups.map(g => (
                                                            <Badge key={g.id} className={`${g.color} mr-1 mb-1 px-1 py-0`}>
                                                                {g.name.substring(0, 1)}:{stat.groupCounts[g.id] || 0}
                                                            </Badge>
                                                        ))}
                                                    </td>
                                                )}
                                                <td className="p-3 text-center text-orange-600">
                                                    {stat.preTransferMaleCount + stat.preTransferFemaleCount > 0 ? `${stat.preTransferMaleCount}/${stat.preTransferFemaleCount}` : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* 범례 및 안내 (상시 노출 영역) */}
            <div className="grid grid-cols-1 gap-4 mt-6">
                {/* 인라인 범례 */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium text-slate-500 px-1">
                    <span className="text-slate-700 font-bold mr-2">범례:</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> 행동(-3)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> 행동(-2)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span> 행동(-1)</span>
                    <span className="flex items-center gap-1.5 ml-2"><span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span> 정서(-3)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> 정서(-2)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span> 정서(-1)</span>
                    <span className="flex items-center gap-1.5 ml-2"><span className="w-2.5 h-2.5 rounded-full bg-slate-200"></span> 일반(0)</span>
                    <span className="flex items-center gap-1.5 ml-2"><span className="w-2.5 h-2.5 rounded-full bg-green-400"></span> 리더(+1)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> 리더(+2)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 상세 점수 기준 안내 */}
                    <div className="p-5 bg-slate-50/50 rounded-xl border border-slate-100 shadow-sm">
                        <h4 className="font-bold text-[12px] text-slate-700 mb-4 flex items-center gap-2">
                            <span className="text-base text-yellow-500">💡</span> 점수 기준 상세 안내
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <div className="space-y-3">
                                <h5 className="flex items-center gap-1.5 font-bold text-orange-700 text-[11px]">
                                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> 행동 (생활지도 소요)
                                </h5>
                                <ul className="text-[10px] text-slate-600 space-y-2 leading-relaxed">
                                    <li>• <strong>-1</strong>: 가벼운 딴짓, 관심 필요</li>
                                    <li>• <strong>-2</strong>: 잦은 방해, 지속적 지도 필요</li>
                                    <li>• <strong>-3</strong>: 심각한 방해, 학교폭력 등 집중 관리 필요</li>
                                </ul>
                            </div>
                            <div className="space-y-3">
                                <h5 className="flex items-center gap-1.5 font-bold text-blue-700 text-[11px]">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> 정서 (세심한 배려)
                                </h5>
                                <ul className="text-[10px] text-slate-600 space-y-2 leading-relaxed">
                                    <li>• <strong>-1</strong>: 다소 예민함, 배려 필요</li>
                                    <li>• <strong>-2</strong>: 교우관계/정서 지원 필요</li>
                                    <li>• <strong>-3</strong>: 특별한 케어/전문가 개입 필요</li>
                                </ul>
                            </div>
                            <div className="space-y-3">
                                <h5 className="flex items-center gap-1.5 font-bold text-emerald-700 text-[11px]">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> 리더 (영향력)
                                </h5>
                                <ul className="text-[10px] text-slate-600 space-y-2 leading-relaxed">
                                    <li>• <strong>+1</strong>: 모범적이고 성실한 학생</li>
                                    <li>• <strong>+2</strong>: 리더십이 탁월한 학생 (회장감)</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-white/50 rounded-xl border border-orange-100/50 shadow-sm backdrop-blur-sm">
                        <h4 className="font-bold text-[13px] text-orange-700 mb-2 flex items-center gap-2">
                            <span className="text-base">⚠️</span> 제약 조건 준수 현황
                        </h4>
                        {violations.length > 0 ? (
                            <div className="space-y-2">
                                <p className="text-[11px] text-orange-600 font-bold">{violations.length}개의 위반 사항이 기록되었습니다.</p>
                                <ul className="text-[10px] text-orange-500 space-y-1">
                                    {violations.slice(0, 2).map((v, i) => <li key={i} className="truncate">• {v.message}</li>)}
                                    {violations.length > 2 && <li className="opacity-70 italic text-[9px]">• ... 외 {violations.length - 2}개</li>}
                                </ul>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 h-full pb-2">
                                <span className="text-xs text-green-600 font-semibold italic">모든 제약 조건을 완벽하게 충족하고 있습니다. ✨</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 제약 조건 위반 경고 다이얼로그 */}
            <Dialog open={!!pendingSwap} onOpenChange={(open) => !open && setPendingSwap(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2 text-red-600">
                            ⚠️ 배정 제약 조건 위반 알림
                        </DialogTitle>
                        <DialogDescription>교환 시 발생하는 제약 조건 위반을 확인하세요.</DialogDescription>
                    </DialogHeader>
                    <p className="text-sm font-medium text-gray-700">
                        두 학생의 위치를 교환할 경우 다음 제약 조건들이 위반됩니다:
                    </p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {pendingSwap?.violations.map((v, i) => (
                            <div key={i} className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-800 leading-relaxed font-medium">
                                • {v.message}
                            </div>
                        ))}
                    </div>
                    <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-100 mt-4">
                        이 위반 사항을 인지하고도 강제로 배정을 변경하시겠습니까?
                    </p>
                    <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                        <Button variant="outline" onClick={() => setPendingSwap(null)}>취소</Button>
                        <Button variant="destructive" onClick={confirmSwap}>강제 변경 실행</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 엑셀 내보내기 옵션 다이얼로그 */}
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2">
                            📥 배정 결과 엑셀 내보내기
                        </DialogTitle>
                        <DialogDescription>
                            필요한 정보 수준에 따라 엑셀 출력 옵션을 선택하세요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            엑셀 파일에 포함할 정보 수준을 선택해 주세요.
                        </p>
                        <div className="grid grid-cols-1 gap-3">
                            <Button
                                variant="outline"
                                className="h-20 flex flex-col items-center justify-center gap-1 hover:border-primary hover:bg-primary/5"
                                onClick={() => confirmExport(false)}
                            >
                                <span className="font-bold text-base text-slate-700">기본 정보만 출력</span>
                                <span className="text-[11px] text-slate-500">배정 결과(학년, 반, 번호)와 기본 인적 사항만 포함</span>
                            </Button>
                            <Button
                                variant="outline"
                                className="h-20 flex flex-col items-center justify-center gap-1 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50"
                                onClick={() => confirmExport(true)}
                            >
                                <span className="font-bold text-base text-indigo-700">상세 정보 포함</span>
                                <span className="text-[11px] text-indigo-500">생활지도, 그룹, 관계 제약, 고정 배정 등 상세 옵션 포함</span>
                            </Button>
                        </div>
                    </div>
                    <div className="flex justify-end pt-2">
                        <Button variant="ghost" onClick={() => setIsExportDialogOpen(false)}>취소</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex justify-between mt-8 border-t pt-6">
                <Button
                    variant="outline"
                    size="lg"
                    onClick={onBack}
                    className="rounded-xl border-slate-200 hover:bg-slate-50 hover:text-indigo-600"
                >
                    ← 이전: 조건 설정
                </Button>
            </div>
        </div >
    );
}
