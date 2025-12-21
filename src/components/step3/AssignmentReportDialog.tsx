'use client';

import { useMemo } from 'react';
import { Student, AssignmentChange } from '@/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

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
    // 1. 囹듸옙囹??旅욘쪐 ?占썲윲 囹몌옙占?
    const relationStats = useMemo(() => {
        const stats = {
            keepTotal: 0,
            keepMet: 0,
            avoidTotal: 0,
            avoidMet: 0,
            details: [] as any[]
        };

        students.forEach(s => {
            // 令덅빱? 獄??獵븝옙 ?邕ㅿ옙??
            s.keep_ids.forEach(kid => {
                const partner = students.find(p => p.id === kid);
                if (partner && s.id < partner.id) { // 辱쀧궍??獄삥떀?
                    stats.keepTotal++;
                    const isSame = s.assigned_class === partner.assigned_class && s.assigned_class !== null;
                    if (isSame) stats.keepMet++;
                    stats.details.push({
                        type: 'keep',
                        names: [s.name, partner.name],
                        status: isSame ? '만족' : '미충족',
                        classes: [s.assigned_class || '미배정', partner.assigned_class || '미배정']
                    });
                }
            });

            // 기피 조건
            s.avoid_ids.forEach(aid => {
                const partner = students.find(p => p.id === aid);
                if (partner && s.id < partner.id) {
                    stats.avoidTotal++;
                    const isSame = s.assigned_class === partner.assigned_class && s.assigned_class !== null;
                    if (!isSame) stats.avoidMet++;
                    stats.details.push({
                        type: 'avoid',
                        names: [s.name, partner.name],
                        status: !isSame ? '만족' : '충돌',
                        classes: [s.assigned_class || '미배정', partner.assigned_class || '미배정']
                    });
                }
            });
        });

        return stats;
    }, [students]);

    // 2. 影욆퀓?②쾺?獄삣윜占??占썲윲
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

    // 3. ?野?옙 獄삣윜占?(囹모쪛깍옙, ?占쏙옙)
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
        // 影ｅ윜???占쏙옙?占쏜쬃??占썲컧獄??帝걟??
        const oldFrame = document.getElementById('print-frame');
        if (oldFrame) document.body.removeChild(oldFrame);

        // ??壅э옙??帝같占??占쏙옙????뽳옙
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
            ? '<tr><td colspan="5" style="text-align:center; padding: 40px; color: #999;">縕먲옙囹??歷좑옙???占쏜졐?占쏜졊?</td></tr>'
            : history.map((c, i) => `
                <tr>
                    <td style="text-align:center;">${i + 1}</td>
                    <td style="text-align:center;">${c.source === 'auto' ? '자동' : '수동'}</td>
                    <td style="text-align:center; font-size: 11px;">${new Date(c.timestamp).toLocaleTimeString()}</td>
                    <td style="font-weight: bold;">
                        ${c.type === 'swap' ? `${c.studentName}<br>??${c.partnerName}` : c.studentName}
                    </td>
                    <td>
                        ${c.type === 'swap'
                    ? `${c.studentName}: ${c.oldClass} ??${c.newClass}<br>${c.partnerName}: ${c.newClass} ??${c.oldClass}`
                    : `${c.oldClass || '미배정'} → ${c.newClass || '미배정'}`
                }
                    </td>
                </tr>
            `).join('');

        const groupHtml = groupStats.length === 0
            ? '<p style="color: #999; margin-left: 10px; font-size: 11pt;">??⑨옙??蘊깍옙占?獄삣윜占?影욆퀓????占쏜졐?占쏜졊?</p>'
            : groupStats.map(g => `
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 11pt; color: #333;">??${g.name}</strong>
                    <div style="margin-top: 5px; padding-left: 15px; font-size: 10pt; line-height: 1.6;">
                        ${g.students.length === 0
                    ? '<span style="color: #999;">獄경쐢占??占쏙옙</span>'
                    : g.students.map(s => `${s.name} (${s.class})`).join(', ')
                }
                    </div>
                </div>
            `).join('');

        const relationHtml = relationStats.details.length === 0
            ? '<p style="color: #999; margin-left: 10px; font-size: 11pt;">??⑨옙??囹듸옙囹?邀썲쐦????占쏜졐?占쏜졊?</p>'
            : `
            <table style="width: 100%; border-collapse: collapse; margin-top: 5px;">
                <thead>
                    <tr style="background-color: #f5f5f5;">
                        <th style="width: 60px;">囹긺┷占?/th>
                        <th>?占???邕ㅿ옙</th>
                        <th>獄삣윜占?囹뜹쐦??(獄?</th>
                        <th style="width: 60px;">?占쏙옙</th>
                    </tr>
                </thead>
                <tbody>
                    ${relationStats.details.map(d => `
                        <tr>
                            <td style="text-align:center;">${d.type === 'keep' ? '?獵븝옙' : '?榕꿜깉'}</td>
                            <td>${d.names.join(', ')}</td>
                            <td style="text-align:center;">${d.classes.join(', ')}</td>
                            <td style="text-align:center; font-weight: bold; color: ${d.status === '?歟볣솷' ? '#2e7d32' : '#d32f2f'}">${d.status}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        const specialHtml = `
            <div style="padding: 10px; border: 1px solid #333; border-radius: 4px;">
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 11pt; color: #333;">??囹모쪛깍옙 獄삣윜占??邕ㅿ옙</strong>
                    <div style="margin-top: 5px; padding-left: 15px;">
                        ${specialStats.fixed.length === 0
                ? '<span style="color: #999; font-size: 10pt;">囹모쪛깍옙 ?邕ㅿ옙 ?占쏙옙</span>'
                : specialStats.fixed.map(s => `
                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 10pt;">
                                    <span>${s.name} (${s.target} ?獵븝옙)</span>
                                    <span style="color: ${s.isMet ? '#2e7d32' : '#d32f2f'}; font-weight: bold; font-size: 9pt;">
                                        ${s.isMet ? `?歟볣솷(${s.class})` : `?占쏙옙(${s.class})`}
                                    </span>
                                </div>
                            `).join('')}
                    </div>
                </div>
                <div style="margin-top: 15px; border-top: 1px dashed #eee; padding-top: 15px;">
                    <strong style="font-size: 11pt; color: #333;">???占쏙옙 ?占쏙옙 ?邕ㅿ옙</strong>
                    <div style="margin-top: 5px; padding-left: 15px; font-size: 10pt; line-height: 1.6;">
                        ${specialStats.preTransfer.length === 0
                ? '<span style="color: #999;">?占쏙옙 ?邕ㅿ옙 ?占쏙옙</span>'
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
                    <title>獄?獄삣윜占?囹뜹쐦??縕먩퉲占??/title>
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
                        <p>容뷴텈占?逆곤옙: ${new Date().toLocaleString()}</p>
                        <h1>獄?獄삣윜占?囹뜹쐦??縕먩퉲占??/h1>
                    </div>

                    <h2>1. 邀썲쐦???旅욘쪐 ??밭깂</h2>
                    <table class="summary-table">
                        <thead>
                            <tr>
                                <th>??? ????/th>
                                <th>?旅욘쪐 / ?占썹쑝</th>
                                <th>?旅욘쪐??(%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>令덅빱? 獄??獵븝옙</td>
                                <td>${relationStats.keepMet} / ${relationStats.keepTotal}</td>
                                <td>${relationStats.keepTotal > 0 ? Math.round((relationStats.keepMet / relationStats.keepTotal) * 100) : 100}%</td>
                            </tr>
                            <tr>
                                <td>?逆ㅳ윸????囹듸옙囹?/td>
                                <td>${relationStats.avoidMet} / ${relationStats.avoidTotal}</td>
                                <td>${relationStats.avoidTotal > 0 ? Math.round((relationStats.avoidMet / relationStats.avoidTotal) * 100) : 100}%</td>
                            </tr>
                            <tr>
                                <td>囹모쪛깍옙 獄삣윜占?辱쀯옙??/td>
                                <td>${specialStats.fixed.filter(s => s.isMet).length} / ${specialStats.fixed.length}</td>
                                <td>${specialStats.fixed.length > 0 ? Math.round((specialStats.fixed.filter(s => s.isMet).length / specialStats.fixed.length) * 100) : 100}%</td>
                            </tr>
                        </tbody>
                    </table>

                    <h3 style="margin-top: 15px; font-size: 13pt;">?占?囹듸옙囹몌옙占??占쏙옙 獄삣윜占???낂쇃</h3>
                    ${relationHtml}

                    <h2>2. 蘊깍옙占?獄삣윜占?影욆퀓??獄??野?옙 獄삣윜占??占썲윲</h2>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div style="padding: 10px; border: 1px solid #333; border-radius: 4px;">
                            ${groupHtml}
                        </div>
                        ${specialHtml}
                    </div>

                    <h2>3. ?占쏙옙 縕먲옙囹??歷좑옙 (容?${history.length}令?</h2>
                    <table class="history-table">

                        <thead>
                            <tr>
                                <th>No</th>
                                <th>囹긺┷占?/th>
                                <th>?帝걟占?/th>
                                <th>?占???邕ㅿ옙</th>
                                <th>?占쏙옙 縕먲옙囹??歷ι뭘</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${historyHtml}
                        </tbody>
                    </table>

                    <div style="margin-top: 50px; text-align: center; font-size: 9pt; color: #999;">
                        Classzle - ?占썹???獄??蘊꾬옙???占쏙옙 獄ㅿ옙?獄?邀썲쐦占?
                    </div>
                </body>
            </html>
        `;

        if (window.electronAPI) {
            window.electronAPI.printPreview(html);
        } else {
            // 影ｅ윜??獄삥떀占? iframe ?燁묌뭘 (????섊?)
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
                // ???占썸뿭?蘊꾦뭘 ?轝좑옙玉붻릊??容븟??
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
                        ?占?獄삣윜占?囹뜹쐦???占쏙옙 玉붺쭜靜⇔??
                    </DialogTitle>
                </DialogHeader>


                <Tabs defaultValue="fulfillment" className="flex-1 overflow-hidden flex flex-col">
                    <div className="px-6 border-b">
                        <TabsList className="w-full justify-start h-12 bg-transparent gap-6 p-0">
                            <TabsTrigger
                                value="fulfillment"
                                className="h-full border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-2"
                            >
                                邀썲쐦???旅욘쪐 ?占썲윲
                            </TabsTrigger>
                            <TabsTrigger
                                value="history"
                                className="h-full border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-2"
                            >
                                ?占쏙옙 縕먲옙囹??歷좑옙 ({history.length})
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        <TabsContent value="fulfillment" className="m-0 space-y-6">
                            {/* 囹듸옙囹??旅욘쪐 ??밭깂 */}
                            <div className="grid grid-cols-2 gap-4">
                                <Card className="bg-pink-50/30 border-pink-100 flex flex-col items-center justify-center text-center py-4 rounded-xl shadow-sm">
                                    <div className="text-sm font-medium text-pink-700 mb-1">?占?令덅빱? 獄??獵븝옙</div>
                                    <div className="text-2xl font-bold text-pink-600">
                                        {relationStats.keepMet} / {relationStats.keepTotal}
                                    </div>
                                    <p className="text-xs text-pink-600/70">?€쵟占??旅욘쪐?? {relationStats.keepTotal > 0 ? Math.round((relationStats.keepMet / relationStats.keepTotal) * 100) : 100}%</p>
                                </Card>
                                <Card className="bg-red-50/30 border-red-100 flex flex-col items-center justify-center text-center py-4 rounded-xl shadow-sm">
                                    <div className="text-sm font-medium text-red-700 mb-1">?墉??逆ㅳ윸????囹듸옙囹</div>
                                    <div className="text-2xl font-bold text-red-600">
                                        {relationStats.avoidMet} / {relationStats.avoidTotal}
                                    </div>
                                    <p className="text-xs text-red-600/70">蘊깍옙???歟볣솷獄? {relationStats.avoidTotal > 0 ? Math.round((relationStats.avoidMet / relationStats.avoidTotal) * 100) : 100}%</p>
                                </Card>
                            </div>

                            {/* 囹듸옙囹??占쏙옙 ?歷π　?*/}
                            <Card className="rounded-xl border-indigo-100 shadow-md shadow-indigo-500/5 bg-white">
                                <CardHeader className="py-3 border-b bg-muted/20">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">?占?囹듸옙囹몌옙占??占쏙옙 獄삣윜占???낂쇃</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-gray-100">
                                        {relationStats.details.length === 0 ? (
                                            <div className="p-8 text-center text-muted-foreground text-sm">??⑨옙??囹듸옙囹?邀썲쐦????占쏜졐?占쏜졊?</div>
                                        ) : relationStats.details.map((detail, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 text-sm">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="outline" className={detail.type === 'keep' ? 'border-pink-200 text-pink-700 bg-pink-50' : 'border-red-200 text-red-700 bg-red-50'}>
                                                        {detail.type === 'keep' ? '?占??獵븝옙' : '?墉??榕꿜깉'}
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
                                                    <Badge variant={detail.status === '?歟볣솷' ? 'default' : 'destructive'} className="w-16 justify-center">
                                                        {detail.status}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* ?€쑉??占?影욆퀓??獄??野?옙 獄삣윜占?*/}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* ?€쑉??占?影욆퀓??*/}
                                <div className="space-y-4">
                                    <h4 className="font-bold text-sm flex items-center gap-2">?靜ㅋ 影욆퀓???邕ㅿ옙 獄삣윜占???낂쇃</h4>
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
                                                        {g.students.length === 0 && <span className="text-muted-foreground">獄경쐢占??占쏙옙</span>}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                    {groupStats.length === 0 && <p className="text-sm text-muted-foreground">??뽳옙??影욆퀓????占쏜졐?占쏜졊?</p>}
                                </div>

                                {/* 囹모쪛깍옙/?占쏙옙 */}
                                <div className="space-y-4">
                                    <h4 className="font-bold text-sm flex items-center gap-2">?占?囹모쪛깍옙 獄??占쏙옙 ?占쏙옙 ?屍귩쪟</h4>
                                    <div className="space-y-4">
                                        <Card>
                                            <CardHeader className="p-3 py-2 bg-muted/10 border-b">
                                                <CardTitle className="text-xs font-bold">囹모쪛깍옙 獄삣윜占??邕ㅿ옙</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-3 space-y-2">
                                                {specialStats.fixed.map((s, i) => (
                                                    <div key={i} className="flex justify-between items-center text-xs">
                                                        <span>{s.name} ({s.target} ?獵븝옙)</span>
                                                        <Badge variant={s.isMet ? 'outline' : 'destructive'} className="text-[10px] h-5">
                                                            {s.isMet ? `?歟볣솷(${s.class})` : `?占쏙옙(${s.class})`}
                                                        </Badge>
                                                    </div>
                                                ))}
                                                {specialStats.fixed.length === 0 && <p className="text-xs text-muted-foreground">囹모쪛깍옙 ?邕ㅿ옙 ?占쏙옙</p>}
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardHeader className="p-3 py-2 bg-muted/10 border-b">
                                                <CardTitle className="text-xs font-bold">?占쏙옙 ?占쏙옙 ?邕ㅿ옙</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-3">
                                                <div className="flex flex-wrap gap-2 text-xs">
                                                    {specialStats.preTransfer.map((s, i) => (
                                                        <span key={i} className="text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-100">
                                                            {s.name} ({s.class})
                                                        </span>
                                                    ))}
                                                    {specialStats.preTransfer.length === 0 && <span className="text-muted-foreground">?占쏙옙 ?邕ㅿ옙 ?占쏙옙</span>}
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
                                    <div className="text-4xl mb-4">?占</div>
                                    <p className="text-sm">獄삣윜占?縕먲옙囹??歷좑옙???占쏜졐?占쏜졊?</p>
                                    <p className="text-xs opacity-60 mt-1">獄삣윜占??轝좑옙 ?占쏙옙 수동 ?歷좑옙 ??影ｅ쐣占????곧졐?占쏜졊?</p>
                                </div>
                            ) : (
                                <div className="flex flex-col h-full">
                                    {/* 囹모쪛깍옙 ??덌옙 - ?轝좑옙獄??占쏜　?獄?*/}
                                    <div className="pb-3 flex justify-between items-center border-b bg-white">
                                        <p className="text-sm text-muted-foreground">容?<strong>{history.length}</strong>令뉑른占??歷좑옙 ?歷π　</p>
                                        <p className="text-xs text-muted-foreground">?歷좑옙?占?'?劑퍠占?獄삣윜占? ??容뺧옙??塋언Œ?占쏜졊?</p>
                                    </div>
                                    {/* ?轝좑옙獄?令덌옙?鴉뺧옙 玉붺쭛????占쏜　?*/}
                                    <div className="divide-y divide-gray-100 border rounded-lg mt-3 overflow-y-auto max-h-[400px]">
                                        {history.map((change, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 px-4 text-sm hover:bg-gray-50 transition-colors">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold ${change.type === 'swap' ? 'text-indigo-700' : 'text-primary'}`}>
                                                            {idx + 1}. {change.type === 'swap' ? '[囹깎쪗э옙] ' : ''}
                                                            {change.studentName}
                                                            {change.type === 'swap' && ` ??${change.partnerName}`}
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
                            보고서 인쇄
                        </Button>
                        <Button onClick={() => onOpenChange(false)}>닫기</Button>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}