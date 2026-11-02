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
import { CheckCircle } from '@phosphor-icons/react';

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
            <div className="bg-blue-50 p-4 rounded-lg text-sm text-gray-700">
                <h4 className="font-bold mb-2">💡 전출 예정 학생 설정 안내</h4>
                <ul className="list-disc list-inside space-y-1">
                    <li>방학 중 전출이 예정된 학생을 선택해주세요.</li>
                    <li>
                        <strong>균형 배정</strong>: 인원, 남녀, 성적은
                        <span className="text-blue-600 font-bold"> 전출 뒤 기준</span>으로 맞추고, 전출 예정 학생은 반마다 고르게 나눕니다.
                    </li>
                    <li>
                        <strong>마지막 번호</strong>: 반 번호가 끊기지 않도록, 성명과 관계없이
                        <span className="text-blue-600 font-bold"> 해당 반의 가장 마지막 번호</span>를 부여받습니다.
                    </li>
                </ul>
            </div>

            <div className="flex gap-4 h-[450px]">
                {/* 왼쪽: 학생 선택 (1/3) */}
                <div className="w-1/3 border rounded-lg p-4 flex flex-col overflow-hidden">
                    <div className="mb-2 flex justify-between items-center">
                        <span className="font-bold text-sm">전체 학생</span>
                        <Select
                            value={classFilter}
                            onValueChange={setClassFilter}
                        >
                            <SelectTrigger className="w-[100px] h-8 text-xs">
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
                        className="h-8 text-sm mb-2"
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
                                    <div className="text-xs font-bold text-gray-500 mb-2 px-1 border-b pb-1 sticky top-0 bg-white z-10 flex justify-between">
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
                                                    className="p-2 hover:bg-accent rounded border cursor-pointer text-sm flex items-center justify-center gap-1 transition-colors"
                                                    onClick={() => onToggleTempPreTransfer(s.id)}
                                                >
                                                    <span className="font-medium whitespace-nowrap">{s.name}</span>
                                                    <span className="text-xs text-muted-foreground whitespace-nowrap">({s.prev_info.split('-')[2]})</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            ))
                        }
                        {Object.keys(studentsByClass).length === 0 && (
                            <div className="text-center text-gray-400 py-4">
                                선택 가능한 학생이 없습니다.
                            </div>
                        )}
                    </div>
                </div>

                {/* 오른쪽: 선택된 학생 목록 (2/3) */}
                <div className="w-2/3 border rounded-lg p-4 flex flex-col overflow-hidden">
                    <div className="mb-3 font-bold text-lg flex items-center gap-2">
                        <span>전출 예정 학생 ({preTransferStudents.length}명)</span>
                        {isSaved && (
                            <span className="flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                <CheckCircle weight="fill" className="w-4 h-4" />
                                저장됨
                            </span>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto rounded-lg p-2 border bg-gray-50">
                        <div className="grid grid-cols-2 gap-2">
                            {preTransferStudents.map(student => (
                                <div
                                    key={student.id}
                                    className="p-3 rounded text-sm border bg-white hover:bg-accent/50 transition-colors"
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium">{student.name} ({student.prev_info})</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs text-destructive hover:text-destructive/80 hover:bg-transparent"
                                            onClick={() => onToggleTempPreTransfer(student.id)}
                                        >
                                            해제
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {preTransferStudents.length === 0 && (
                            <div className="text-center text-gray-400 py-10">
                                왼쪽에서 학생을 클릭하여 전출 예정에 추가해주세요.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

