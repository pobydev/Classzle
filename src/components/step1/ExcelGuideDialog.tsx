'use client';

// 1단계 '작성 방법'을 누르면 여는 엑셀 양식 안내 창입니다.

import { ChartBar, Minus } from '@phosphor-icons/react';
import { BehaviorIcon } from '@/components/BehaviorChip';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ExcelGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[60vw] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ChartBar size={20} className="text-accent" aria-hidden="true" />
                        엑셀 파일 작성 방법
                    </DialogTitle>
                    <DialogDescription>학생 명단 엑셀 파일을 만드는 방법입니다.</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 pt-4">
                    <Tabs defaultValue="form-a" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="form-a">양식 A: 새로 편성할 때</TabsTrigger>
                            <TabsTrigger value="form-b">양식 B: 편성한 안을 고칠 때</TabsTrigger>
                        </TabsList>

                        <TabsContent value="form-a" className="space-y-6">
                            <div className="space-y-2">
                                <h3 className="font-semibold text-title-sm flex items-center gap-2">
                                    <span className="bg-wash text-accent w-6 h-6 rounded-full flex items-center justify-center text-body">1</span>
                                    꼭 있어야 하는 칸 (양식 A)
                                </h3>
                                <p className="text-body text-soft ml-8">
                                    새로 반을 편성할 때 씁니다. 엑셀 첫 줄(제목 줄)에 아래 칸이 있어야 합니다.
                                </p>
                                <div className="ml-8 border rounded-input overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-canvas">
                                            <TableRow>
                                                <TableHead className="w-24">항목</TableHead>
                                                <TableHead>설명과 예시</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="text-body">
                                            <TableRow>
                                                <TableCell className="font-medium">학년/반/번호</TableCell>
                                                <TableCell>
                                                    이전 학년도의 학년, 반, 번호입니다.<br />
                                                    <span className="text-soft text-caption">예: 2 (학년), 1 (반), 15 (번호)</span>
                                                </TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell className="font-medium">이름</TableCell>
                                                <TableCell>학생 이름 (꼭 넣어야 합니다)</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell className="font-medium">성별</TableCell>
                                                <TableCell>'남', '여', 'M', 'F' 중 하나</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell className="font-medium">성적</TableCell>
                                                <TableCell>성적 점수나 등급 (숫자)</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell className="font-medium">생활지도</TableCell>
                                                <TableCell>
                                                    생활지도 값 (아래 2번을 봅니다)
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
                                    꼭 있어야 하는 칸 (양식 B)
                                </h3>
                                <p className="text-body text-soft ml-8">
                                    이미 나눈 배정안을 불러와 고칠 때 씁니다.<br />
                                    (3단계 반 편성에서 <strong>현재 배정 수정</strong>을 골라 이어서 고칩니다.)
                                </p>
                                <div className="ml-8 border rounded-input overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-canvas">
                                            <TableRow>
                                                <TableHead className="w-32">항목</TableHead>
                                                <TableHead>설명과 예시</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="text-body">
                                            <TableRow>
                                                <TableCell className="font-medium">
                                                    <span className="text-accent-ink font-bold">배정 학년/반/번호</span>
                                                    <br />(앞쪽 열)
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-semibold text-accent-ink">새 학년도</span> 학년, 반, 번호입니다.<br />
                                                    <span className="text-soft text-caption">예: 3 (학년), 1 (반), 1 (번호)</span>
                                                </TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell className="font-medium">
                                                    <span className="text-soft font-bold">이전 학년/반/번호</span>
                                                    <br />(뒤쪽 열)
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-semibold text-soft">이전 학년도</span> 학년, 반, 번호입니다.<br />
                                                    <span className="text-soft text-caption">예: 2 (학년), 1 (반), 15 (번호)</span>
                                                </TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell className="font-medium">이름/성별/성적</TableCell>
                                                <TableCell>양식 A와 같습니다.</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell className="font-medium">생활지도</TableCell>
                                                <TableCell>양식 A와 같습니다.</TableCell>
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
                            생활지도 값 (두 양식 공통)
                        </h3>
                        <p className="text-body text-soft ml-8">
                            '생활지도' 칸에는 아래 글자를 그대로 넣어야 값이 들어갑니다. 학생마다 값은 하나입니다.
                        </p>
                        <div className="ml-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="border rounded-input p-3">
                                <span className="font-bold text-ink flex items-center gap-1.5 mb-2"><BehaviorIcon type="LEADER" /> 리더 (더하는 점수)</span>
                                <ul className="list-disc list-inside text-body space-y-1 text-soft">
                                    <li><code className="text-ink font-semibold">리더(+2)</code> : 리더십이 탁월한 학생 (회장감)</li>
                                    <li><code className="text-ink font-semibold">리더(+1)</code> : 모범적이고 성실한 학생</li>
                                </ul>
                            </div>
                            <div className="border rounded-input p-3">
                                <span className="font-bold text-ink flex items-center gap-1.5 mb-2"><BehaviorIcon type="BEHAVIOR" /> 행동 (빼는 점수)</span>
                                <ul className="list-disc list-inside text-body space-y-1 text-soft">
                                    <li><code className="text-ink font-semibold">행동(-3)</code> : 심각한 방해, 학교폭력 등 집중 관리 필요</li>
                                    <li><code className="text-ink font-semibold">행동(-2)</code> : 잦은 방해, 지속적 지도 필요</li>
                                    <li><code className="text-ink font-semibold">행동(-1)</code> : 가벼운 딴짓, 관심 필요</li>
                                </ul>
                            </div>
                            <div className="border rounded-input p-3">
                                <span className="font-bold text-ink flex items-center gap-1.5 mb-2"><BehaviorIcon type="EMOTIONAL" /> 정서 (빼는 점수)</span>
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
                                    (0점으로 봅니다)
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button onClick={() => onOpenChange(false)}>확인</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
