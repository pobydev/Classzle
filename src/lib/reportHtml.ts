import { groupHistory } from '@/lib/history';
import type { AssignmentChange } from '@/types';

// 인쇄용 리포트 HTML입니다. 이름과 그룹 이름은 교사가 넣은 값이고 엑셀에서도 들어오므로 모두 이스케이프합니다.

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value: string | number | null | undefined): string {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export interface ReportData {
    history: AssignmentChange[];
    groupStats: { name: string; students: { name: string; class: string }[] }[];
    relationStats: {
        keepMet: number;
        keepTotal: number;
        avoidMet: number;
        avoidTotal: number;
        classDetails: Record<string, { type: 'keep' | 'avoid'; names: string[]; status: string; classes: string[] }[]>;
    };
    movementStats: { name: string; initialClass?: string | null; finalClass?: string | null }[];
    specialStats: {
        fixed: { name: string; class: string; target?: string | null; isMet: boolean }[];
        preTransfer: { name: string; class: string }[];
    };
    printedAt: string;
}

export function buildReportHtml({ history, groupStats, relationStats, movementStats, specialStats, printedAt }: ReportData): string {
    const historyEntries = groupHistory(history);

    const historyHtml = history.length === 0
        ? '<tr><td colspan="5" style="text-align:center; padding: 40px; color: #999;">배정 변경 이력이 없습니다.</td></tr>'
        : historyEntries.map((entry, i) => {
            const describe = (c: AssignmentChange) => c.type === 'swap'
                ? `${esc(c.studentName)}: ${esc(c.oldClass)} →${esc(c.newClass)}<br>${esc(c.partnerName)}: ${esc(c.newClass)} →${esc(c.oldClass)}`
                : `${esc(c.studentName)}: ${esc(c.oldClass || '미배정')} → ${esc(c.newClass || '미배정')}`;
            const isRun = entry.source === 'auto' && entry.changes.length > 1;
            const first = entry.changes[0];
            return `
            <tr>
                <td style="text-align:center;">${i + 1}</td>
                <td style="text-align:center;">${entry.source === 'auto' ? '자동' : '수동'}</td>
                <td style="text-align:center; font-size: 11px;">${new Date(entry.timestamp).toLocaleTimeString()}</td>
                <td style="font-weight: bold;">
                    ${isRun
                ? `자동 수정 ${entry.changes.length}건`
                : first.type === 'swap' ? `${esc(first.studentName)}<br>↔${esc(first.partnerName)}` : esc(first.studentName)}
                </td>
                <td>${entry.changes.map(describe).join('<br>')}</td>
            </tr>`;
        }).join('');

    const groupHtml = groupStats.length === 0
        ? '<p style="color: #999; margin-left: 10px; font-size: 11pt;">설정된 그룹 분산이 없습니다.</p>'
        : groupStats.map(g => `
            <div style="margin-bottom: 12px;">
                <strong style="font-size: 11pt; color: #333;">그룹명: ${esc(g.name)}</strong>
                <div style="margin-top: 5px; padding-left: 15px; font-size: 10pt; line-height: 1.6;">
                    ${g.students.length === 0
                ? '<span style="color: #999;">소속 학생 없음</span>'
                : g.students.map(s => `${esc(s.name)} (${esc(s.class)})`).join(', ')
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
                    이전 학년도: ${esc(className)}
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
                                        ${d.type === 'keep' ? '함께 배정' : '분리 배정'}
                                    </span>
                                </td>
                                <td>
                                    ${esc(d.names[0])} (${esc(d.classes[0])}) - ${esc(d.names[1])} (${esc(d.classes[1])})
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
                                <td style="text-align:center; font-weight: bold;">${esc(s.name)}</td>
                                <td style="text-align:center;">${esc(s.initialClass)}</td>
                                <td style="text-align:center; font-weight: bold; color: #4f46e5;">${esc(s.finalClass)}</td>
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
                                <span>${esc(s.name)} (${esc(s.target)} 고정)</span>
                                <span style="color: ${s.isMet ? '#2e7d32' : '#d32f2f'}; font-weight: bold; font-size: 9pt;">
                                    ${s.isMet ? `만족(${esc(s.class || '미배정')})` : `미충족(${esc(s.class || '미배정')})`}
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
            : specialStats.preTransfer.map(s => `${esc(s.name)} (${esc(s.class || '미배정')})`).join(', ')
        }
                </div>
            </div>
        </div>
    `;

    return `
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
                    <p>출력 일시: ${esc(printedAt)}</p>
                    <h1>학생 배정 상세 리포트</h1>
                </div>

                <h2>1. 그룹별 배정 현황 및 특수 배정 현황</h2>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div style="padding: 10px; border: 1px solid #333; border-radius: 4px;">
                        ${groupHtml}
                    </div>
                    ${specialHtml}
                </div>

                <h2>2. 지킨 조건 요약</h2>
                <table class="summary-table">
                    <thead>
                        <tr>
                            <th>구분 (조건)</th>
                            <th>지킨 조건 / 전체</th>
                            <th>지킨 비율(%)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>함께 배정</td>
                            <td>${relationStats.keepMet} / ${relationStats.keepTotal}</td>
                            <td>${relationStats.keepTotal > 0 ? Math.round((relationStats.keepMet / relationStats.keepTotal) * 100) : 100}%</td>
                        </tr>
                        <tr>
                            <td>분리 배정</td>
                            <td>${relationStats.avoidMet} / ${relationStats.avoidTotal}</td>
                            <td>${relationStats.avoidTotal > 0 ? Math.round((relationStats.avoidMet / relationStats.avoidTotal) * 100) : 100}%</td>
                        </tr>
                        <tr>
                            <td>고정 배정</td>
                            <td>${specialStats.fixed.filter(s => s.isMet).length} / ${specialStats.fixed.length}</td>
                            <td>${specialStats.fixed.length > 0 ? Math.round((specialStats.fixed.filter(s => s.isMet).length / specialStats.fixed.length) * 100) : 100}%</td>
                        </tr>
                    </tbody>
                </table>

                <h3 style="margin-top: 15px; font-size: 13pt;">학급별 관계 상세 현황</h3>
                ${relationHtml}

                <h2>3. 이동 학생 명단 (총 ${movementStats.length}명)</h2>
                ${movementHtml}

                <h2>4. 변경 누적 이력 (총 ${historyEntries.length}건)</h2>
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
}
