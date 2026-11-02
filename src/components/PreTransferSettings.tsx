import React, { useState } from 'react';
import { Student } from '@/types';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, Lightbulb } from '@phosphor-icons/react';

interface PreTransferSettingsProps {
    students: Student[];
    tempPreTransferIds: string[];
    onToggleTempPreTransfer: (studentId: string) => void;
    hasUnsavedChanges?: boolean;
}

export default function PreTransferSettings({
    students,
    tempPreTransferIds,
    onToggleTempPreTransfer,
    hasUnsavedChanges = false
}: PreTransferSettingsProps) {
    const [classFilter, setClassFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Extract unique class numbers for filtering
    const availableClasses = Array.from(new Set(students.map(s => s.prev_info.split('-')[1] || '')))
        .sort((a, b) => parseInt(a) - parseInt(b))
        .filter(c => c);

    const preTransferStudents = students
        .filter(s => tempPreTransferIds.includes(s.id))
        .sort((a, b) => {
            // 반별, 번호순 정렬
            const classA = parseInt(a.prev_info.split('-')[1] || '0');
            const classB = parseInt(b.prev_info.split('-')[1] || '0');
            if (classA !== classB) return classA - classB;
            const numA = parseInt(a.prev_info.split('-')[2] || '0');
            const numB = parseInt(b.prev_info.split('-')[2] || '0');
            return numA - numB;
        });

    const availableStudents = students
        .filter(s => !tempPreTransferIds.includes(s.id))
        .filter(s => classFilter === 'all' || s.prev_info.split('-')[1] === classFilter)
        .filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()));

    // Group available students by class
    const studentsByClass = availableStudents.reduce((acc, s) => {
        const cls = s.prev_info.split('-')[1] || '기타';
        if (!acc[cls]) acc[cls] = [];
        acc[cls].push(s);
        return acc;
    }, {} as Record<string, typeof students>);

    const isSaved = !hasUnsavedChanges && tempPreTransferIds.length > 0;

    return (
        <div className="space-y-6">
            <div className="bg-wash p-4 rounded-card text-body text-ink">
                <h4 className="font-bold mb-2 flex items-center gap-1.5"><Lightbulb size={16} className="text-accent" aria-hidden="true" /> 전출 예정 학생 설정 안내</h4>
                <ul className="list-disc list-inside space-y-1">
                    <li>방학 중 전출이 예정된 학생을 선택해 주세요.</li>
                    <li>
                        <strong>균형 배정</strong>: 인원, 남녀, 성적은
                        <span className="text-accent-ink font-bold"> 전출 뒤 기준</span>으로 맞추고, 전출 예정 학생은 반마다 고르게 나눕니다.
                    </li>
                    <li>
                        <strong>마지막 번호</strong>: 반 번호가 끊기지 않도록, 성명과 관계없이
                        <span className="text-accent-ink font-bold"> 해당 반의 가장 마지막 번호</span>를 부여받습니다.
                    </li>
                </ul>
            </div>

            <div className="flex gap-4 h-[450px]">
                {/* 왼쪽: 학생 선택 (1/3) */}
                <div className="w-1/3 border rounded-card p-4 flex flex-col overflow-hidden">
                    <div className="mb-2 flex justify-between items-center">
                        <span className="font-bold text-body">전체 학생</span>
                        <Select
                            value={classFilter}
                            onValueChange={setClassFilter}
                        >
                            <SelectTrigger className="w-[100px] h-8 text-caption">
                                <SelectValue placeholder="이전반 선택" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">전체</SelectItem>
                                {availableClasses.map(cls => (
                                    <SelectItem key={cls} value={cls}>{cls}반</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Input
                        placeholder="이름 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 text-body mb-2"
                    />
                    <div className="flex-1 overflow-y-auto p-1">
                        {Object.entries(studentsByClass)
                            .sort((a, b) => {
                                if (a[0] === '기타') return 1;
                                if (b[0] === '기타') return -1;
                                return parseInt(a[0]) - parseInt(b[0]);
                            })
                            .map(([cls, classStudents]) => (
                                <div key={cls} className="mb-4 last:mb-0">
                                    <div className="text-caption font-bold text-soft mb-2 px-1 border-b pb-1 sticky top-0 bg-card z-10 flex justify-between">
                                        <span>{cls}반</span>
                                        <span className="font-normal">{classStudents.length}명</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {classStudents
                                            .sort((a, b) => {
                                                const numA = parseInt(a.prev_info.split('-')[2] || '0');
                                                const numB = parseInt(b.prev_info.split('-')[2] || '0');
                                                if (numA !== numB) return numA - numB;
                                                return a.name.localeCompare(b.name);
                                            })
                                            .map(s => (
                                                <div
                                                    key={s.id}
                                                    className="p-2 hover:bg-wash rounded-input border cursor-pointer text-body flex items-center justify-center gap-1 transition-colors"
                                                    onClick={() => onToggleTempPreTransfer(s.id)}
                                                >
                                                    <span className="font-medium whitespace-nowrap">{s.name}</span>
                                                    <span className="text-caption text-soft whitespace-nowrap">({s.prev_info.split('-')[2]})</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            ))
                        }
                        {Object.keys(studentsByClass).length === 0 && (
                            <div className="text-center text-soft py-4">
                                선택 가능한 학생이 없습니다.
                            </div>
                        )}
                    </div>
                </div>

                {/* 오른쪽: 선택된 학생 목록 (2/3) */}
                <div className="w-2/3 border rounded-card p-4 flex flex-col overflow-hidden">
                    <div className="mb-3 font-bold text-emph flex items-center gap-2">
                        <span>전출 예정 학생 ({preTransferStudents.length}명)</span>
                        {isSaved && (
                            <span className="flex items-center gap-1 text-caption font-medium text-accent-ink bg-wash px-2 py-0.5 rounded-full">
                                <CheckCircle className="w-4 h-4" />
                                저장됨
                            </span>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto rounded-card p-2 border bg-canvas">
                        <div className="grid grid-cols-2 gap-2">
                            {preTransferStudents.map(student => (
                                <div
                                    key={student.id}
                                    className="p-3 rounded-input text-body border bg-card hover:bg-wash transition-colors"
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium">{student.name} ({student.prev_info})</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-caption text-danger hover:text-danger hover:bg-danger-wash"
                                            onClick={() => onToggleTempPreTransfer(student.id)}
                                        >
                                            해제
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {preTransferStudents.length === 0 && (
                            <div className="text-center text-soft py-10">
                                왼쪽에서 학생을 클릭하여 전출 예정에 추가해 주세요.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

