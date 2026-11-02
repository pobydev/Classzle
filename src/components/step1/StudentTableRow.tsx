'use client';

// 학생 표의 한 줄. 300명이 넘어도 값 하나를 바꿀 때 바뀐 줄만 다시 그리도록 memo로 둡니다.

import { memo } from 'react';
import { PencilSimple, Trash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableCell, TableRow } from '@/components/ui/table';
import type { BehaviorType, Gender, Student } from '@/types';
import { BehaviorPicker } from './BehaviorPicker';

function StudentTableRowBase({
    student,
    index,
    isEditing,
    onEditingChange,
    onUpdate,
    onBehaviorChange,
    onDelete,
}: {
    student: Student;
    index: number;
    isEditing: boolean;
    onEditingChange: (id: string | null) => void;
    onUpdate: (id: string, updates: Partial<Student>) => void;
    onBehaviorChange: (id: string, type: BehaviorType, score: number) => void;
    onDelete: (id: string) => void;
}) {
    return (
        <TableRow className="focus-within:bg-wash">
            <TableCell className="text-soft text-center">{index + 1}</TableCell>
            <TableCell className="text-center">
                {isEditing ? (
                    <Input
                        value={student.name}
                        onChange={(e) => onUpdate(student.id, { name: e.target.value })}
                        className="w-20 h-8 mx-auto text-center"
                    />
                ) : (
                    <span className="font-medium">{student.name}</span>
                )}
            </TableCell>
            <TableCell className="text-center">
                {isEditing ? (
                    <Input
                        value={student.prev_info}
                        onChange={(e) => onUpdate(student.id, { prev_info: e.target.value })}
                        className="w-20 h-8 mx-auto text-center"
                    />
                ) : (
                    student.prev_info
                )}
            </TableCell>
            <TableCell className="text-center">
                {isEditing ? (
                    <Select value={student.gender} onValueChange={(v) => onUpdate(student.id, { gender: v as Gender })}>
                        <SelectTrigger className="w-14 h-8 mx-auto">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="M">남</SelectItem>
                            <SelectItem value="F">여</SelectItem>
                        </SelectContent>
                    </Select>
                ) : student.gender === 'M' ? (
                    '남'
                ) : (
                    '여'
                )}
            </TableCell>
            <TableCell className="text-center">
                {isEditing ? (
                    <Input
                        type="number"
                        value={student.academic_score}
                        onChange={(e) => onUpdate(student.id, { academic_score: parseInt(e.target.value) || 0 })}
                        className="w-16 h-8 mx-auto text-center"
                    />
                ) : (
                    student.academic_score
                )}
            </TableCell>
            <TableCell className="text-center">
                <BehaviorPicker
                    studentId={student.id}
                    studentName={student.name}
                    type={student.behavior_type}
                    score={student.behavior_score}
                    onChange={onBehaviorChange}
                />
            </TableCell>
            <TableCell className="text-center">{student.assigned_class || '-'}</TableCell>
            <TableCell className="text-center">
                <div className="flex gap-1 justify-center">
                    {isEditing ? (
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onEditingChange(null)}>
                            완료
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            aria-label={`${student.name} 수정`}
                            onClick={() => onEditingChange(student.id)}
                        >
                            <PencilSimple size={16} />
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-danger hover:text-danger hover:bg-danger-wash"
                        aria-label={`${student.name} 삭제`}
                        onClick={() => onDelete(student.id)}
                    >
                        <Trash size={16} />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}

export const StudentTableRow = memo(StudentTableRowBase);
