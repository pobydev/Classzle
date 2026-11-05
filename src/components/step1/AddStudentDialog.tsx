'use client';

// 명단에 없는 학생을 한 명 더합니다.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BEHAVIOR_CHOICES, scoreFromInput } from '@/lib/studentInput';
import { useClasszleStore } from '@/lib/store';
import type { BehaviorType, Gender, Student } from '@/types';

const EMPTY: Partial<Student> = {
    name: '',
    prev_info: '',
    gender: 'M',
    academic_score: 500,
    behavior_score: 0,
    behavior_type: 'NONE',
};

export function AddStudentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const addStudent = useClasszleStore((state) => state.addStudent);
    const [draft, setDraft] = useState<Partial<Student>>(EMPTY);

    const add = () => {
        if (!draft.name?.trim()) return;
        addStudent({
            name: draft.name.trim(),
            prev_info: draft.prev_info || '',
            gender: (draft.gender as Gender) || 'M',
            academic_score: draft.academic_score ?? 500,
            behavior_score: draft.behavior_score ?? 0,
            behavior_type: (draft.behavior_type as BehaviorType) ?? 'NONE',
            behavior_note: '',
            group_ids: [],
            avoid_ids: [],
            keep_ids: [],
            fixed_class: undefined,
            assigned_class: null,
        });
        setDraft(EMPTY);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>학생 추가</DialogTitle>
                    <DialogDescription>명단에 없는 학생을 더합니다.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right" htmlFor="new-student-name">이름</label>
                        <Input id="new-student-name" className="col-span-3" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right" htmlFor="new-student-prev">전학년도</label>
                        <Input
                            id="new-student-prev"
                            className="col-span-3"
                            placeholder="학년-반-번호, 예: 3-2-15"
                            value={draft.prev_info}
                            onChange={(e) => setDraft({ ...draft, prev_info: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right">성별</label>
                        <Select value={draft.gender} onValueChange={(v) => setDraft({ ...draft, gender: v as Gender })}>
                            <SelectTrigger className="col-span-3" aria-label="성별">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="M">남</SelectItem>
                                <SelectItem value="F">여</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right" htmlFor="new-student-score">성적</label>
                        <Input
                            id="new-student-score"
                            className="col-span-3"
                            type="number"
                            step="any"
                            value={draft.academic_score ?? ''}
                            onChange={(e) => setDraft({ ...draft, academic_score: scoreFromInput(e.target.value) })}
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right">생활지도</label>
                        <Select
                            value={`${draft.behavior_type}:${draft.behavior_score}`}
                            onValueChange={(v) => {
                                const choice = BEHAVIOR_CHOICES.find((c) => c.value === v);
                                if (choice) setDraft({ ...draft, behavior_type: choice.type, behavior_score: choice.score });
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
                    <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
                    {/* 이름이 없으면 눌러도 아무 일이 없으므로 꺼 둡니다. */}
                    <Button onClick={add} disabled={!draft.name?.trim()} title={draft.name?.trim() ? undefined : '이름을 넣어 주세요'}>추가</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
