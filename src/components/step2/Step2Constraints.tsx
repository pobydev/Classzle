'use client';

import { useState, useEffect } from 'react';
import { useClasszleStore } from '@/lib/store';
import { CustomGroup, Student } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import PreTransferSettings from '@/components/PreTransferSettings';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PencilSimple, Trash, WarningCircle, Handshake, ArrowsLeftRight } from '@phosphor-icons/react';


interface Step2ConstraintsProps {
    onBack: () => void;
    onNext: () => void;
}

const GROUP_COLORS = [
    { name: '빨강', value: 'bg-red-200 text-red-800' },
    { name: '주황', value: 'bg-orange-200 text-orange-800' },
    { name: '노랑', value: 'bg-yellow-200 text-yellow-800' },
    { name: '초록', value: 'bg-green-200 text-green-800' },
    { name: '파랑', value: 'bg-blue-200 text-blue-800' },
    { name: '보라', value: 'bg-purple-200 text-purple-800' },
    { name: '분홍', value: 'bg-pink-200 text-pink-800' },
    { name: '청록', value: 'bg-cyan-200 text-cyan-800' },
];

export default function Step2Constraints({ onBack, onNext }: Step2ConstraintsProps) {
    const {
        students,
        groups,
        settings,
        addGroup,
        updateGroup,
        addStudentToGroup,
        removeStudentFromGroup,
        addAvoidRelation,
        removeAvoidRelation,
        addKeepRelation,
        removeKeepRelation,
        setFixedClass,
        updateStudent,
        deleteGroup,

    } = useClasszleStore();

    const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<CustomGroup | null>(null);
    const [newGroup, setNewGroup] = useState({
        name: '',
        color: GROUP_COLORS[0].value,
    });

    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [relationMode, setRelationMode] = useState<'avoid' | 'keep' | 'fixed' | 'pretransfer' | null>(null);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [relationMemo, setRelationMemo] = useState('');
    const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
    const [tempMemberIds, setTempMemberIds] = useState<string[]>([]);
    // 분산배정 그룹 학생 검색
    const [groupStudentSearch, setGroupStudentSearch] = useState<string>('');
    // 고정 배정 학생 검색
    const [fixedStudentSearch, setFixedStudentSearch] = useState<string>('');
    // 기준 학생용 필터/검색 (피해야 할 관계, 같은 반 희망)
    const [baseStudentClassFilter, setBaseStudentClassFilter] = useState<string>('all');
    const [baseStudentSearch, setBaseStudentSearch] = useState<string>('');
    // 대상 학생용 필터/검색 (피해야 할 관계, 같은 반 희망)
    const [targetStudentClassFilter, setTargetStudentClassFilter] = useState<string>('all');
    const [targetStudentSearch, setTargetStudentSearch] = useState<string>('');
    const [tempRelationTargetIds, setTempRelationTargetIds] = useState<string[]>([]);
    const [tempRelationMemos, setTempRelationMemos] = useState<Record<string, string>>({});
    const [selectedRelationsForDelete, setSelectedRelationsForDelete] = useState<Set<string>>(new Set());
    const [tempFixedClass, setTempFixedClass] = useState<string | undefined>(undefined);
    const [tempPreTransferIds, setTempPreTransferIds] = useState<string[]>([]);

    // Sync tempMemberIds when group is selected
    useEffect(() => {
        if (selectedGroupId) {
            const group = groups.find(g => g.id === selectedGroupId);
            if (group) {
                setTempMemberIds(group.member_ids);
            }
        } else {
            setTempMemberIds([]);
        }
    }, [selectedGroupId, groups]);

    // Sync tempRelationTargetIds and tempRelationMemos when base student is selected for avoid/keep
    useEffect(() => {
        if (selectedStudent && (relationMode === 'avoid' || relationMode === 'keep')) {
            const ids = relationMode === 'avoid' ? selectedStudent.avoid_ids : selectedStudent.keep_ids;
            const memos = relationMode === 'avoid' ? selectedStudent.avoid_memos : selectedStudent.keep_memos;
            setTempRelationTargetIds([...ids]);
            setTempRelationMemos(memos ? { ...memos } : {});
            // 대상 학생 필터/검색만 초기화 (기준 학생 필터는 유지)
            setTargetStudentClassFilter('all');
            setTargetStudentSearch('');
        } else {
            setTempRelationTargetIds([]);
            setTempRelationMemos({});
        }

        // Initialize pre-transfer temp state
        if (relationMode === 'pretransfer') {
            const ids = students.filter(s => s.is_pre_transfer).map(s => s.id);
            setTempPreTransferIds(ids);
        }
    }, [selectedStudent, relationMode, students]);

    // Extract unique class numbers for filtering
    const availableClasses = Array.from(new Set(students.map(s => s.prev_info.split('-')[1] || '')))
        .sort((a, b) => parseInt(a) - parseInt(b))
        .filter(c => c);

    // Get all existing relations for summary display, grouped by base student's class
    // Same-class: show once only, Cross-class: show in both sections
    const getRelationsGroupedByClass = (mode: 'avoid' | 'keep') => {
        const relationsByClass: Record<string, { studentA: Student; studentB: Student; memo?: string }[]> = {};
        const seenSameClassPairs = new Set<string>(); // 같은 반 내 중복 방지용

        students.forEach(student => {
            const ids = mode === 'avoid' ? student.avoid_ids : student.keep_ids;
            const memos = mode === 'avoid' ? student.avoid_memos : student.keep_memos;

            if (ids.length === 0) return;

            const studentClass = student.prev_info.split('-')[1] || '기타';
            if (!relationsByClass[studentClass]) relationsByClass[studentClass] = [];

            ids.forEach(targetId => {
                const target = students.find(s => s.id === targetId);
                if (!target) return;

                const targetClass = target.prev_info.split('-')[1] || '기타';
                const memo = memos?.[targetId];

                if (studentClass === targetClass) {
                    // 같은 반: 중복 방지 (정렬된 ID 쌍으로 체크)
                    const pairKey = [student.id, target.id].sort().join('|');
                    if (!seenSameClassPairs.has(pairKey)) {
                        seenSameClassPairs.add(pairKey);
                        relationsByClass[studentClass].push({ studentA: student, studentB: target, memo });
                    }
                } else {
                    // 다른 반: 각 반에 표시 (기존 로직)
                    relationsByClass[studentClass].push({ studentA: student, studentB: target, memo });
                }
            });
        });

        // 각 반별로 기준 학생 번호순 정렬 (오름차순)
        Object.keys(relationsByClass).forEach(cls => {
            relationsByClass[cls].sort((a, b) => {
                const numA = parseInt(a.studentA.prev_info.split('-')[2] || '0');
                const numB = parseInt(b.studentA.prev_info.split('-')[2] || '0');
                if (numA !== numB) return numA - numB;
                // 같은 번호면 대상 학생 번호순
                const targetNumA = parseInt(a.studentB.prev_info.split('-')[2] || '0');
                const targetNumB = parseInt(b.studentB.prev_info.split('-')[2] || '0');
                return targetNumA - targetNumB;
            });
        });

        return relationsByClass;
    };

    const getTotalRelationsCount = (mode: 'avoid' | 'keep') => {
        return Object.values(getRelationsGroupedByClass(mode)).flat().length;
    };

    const handleSaveGroupMembers = () => {
        if (!selectedGroupId) return;
        const group = groups.find(g => g.id === selectedGroupId);
        if (!group) return;

        const originalIds = group.member_ids;
        const added = tempMemberIds.filter(id => !originalIds.includes(id));
        const removed = originalIds.filter(id => !tempMemberIds.includes(id));

        added.forEach(id => addStudentToGroup(id, selectedGroupId));
        removed.forEach(id => removeStudentFromGroup(id, selectedGroupId));

        setSelectedGroupId(null);
    };

    const hasUnsavedRelationChanges = () => {
        if (!selectedStudent || (relationMode !== 'avoid' && relationMode !== 'keep')) {
            return false;
        }
        const originalIds = relationMode === 'avoid' ? selectedStudent.avoid_ids : selectedStudent.keep_ids;
        const originalMemos = relationMode === 'avoid' ? selectedStudent.avoid_memos : selectedStudent.keep_memos;

        // Check if target IDs changed
        const idsChanged = tempRelationTargetIds.length !== originalIds.length ||
            tempRelationTargetIds.some(id => !originalIds.includes(id)) ||
            originalIds.some(id => !tempRelationTargetIds.includes(id));

        // Check if memos changed
        const memosChanged = tempRelationTargetIds.some(id => {
            const originalMemo = originalMemos?.[id] || '';
            const newMemo = tempRelationMemos[id] || '';
            return originalMemo !== newMemo;
        });

        return idsChanged || memosChanged;
    };

    const hasUnsavedFixedChanges = () => {
        if (!selectedStudent || relationMode !== 'fixed') return false;

        const originalFixed = selectedStudent.fixed_class;
        const originalMemo = selectedStudent.fixed_class_memo || '';

        return tempFixedClass !== originalFixed || relationMemo !== originalMemo;
    };

    const hasUnsavedPreTransferChanges = () => {
        if (relationMode !== 'pretransfer') return false;

        const originalIds = students.filter(s => s.is_pre_transfer).map(s => s.id);
        if (tempPreTransferIds.length !== originalIds.length) return true;

        return tempPreTransferIds.some(id => !originalIds.includes(id));
    };

    // Check for any unsaved changes across all modes
    const hasAnyUnsavedChanges = () => {
        if (selectedGroupId) return true; // Editing a group
        if (hasUnsavedRelationChanges()) return true; // Editing relations
        if (hasUnsavedFixedChanges()) return true; // Editing fixed assignment
        if (hasUnsavedPreTransferChanges()) return true; // Editing pre-transfer students
        return false;
    };

    const handleNext = () => {
        if (hasAnyUnsavedChanges()) {
            const confirmed = window.confirm(
                '저장하지 않은 변경사항이 있습니다.\n\n' +
                '확인: 변경사항을 버리고 다음 단계로 이동\n' +
                '취소: 현재 화면에 머무르기'
            );
            if (!confirmed) return;
        }
        onNext();
    };

    const handleSelectBaseStudent = (student: Student) => {
        // Check for unsaved changes before switching
        if (selectedStudent && selectedStudent.id !== student.id) {
            if (hasUnsavedRelationChanges() || hasUnsavedFixedChanges()) {
                const confirmed = window.confirm(
                    '저장하지 않은 변경사항이 있습니다.\n\n' +
                    '확인: 변경사항을 버리고 다른 학생 선택\n' +
                    '취소: 현재 학생 계속 편집'
                );
                if (!confirmed) {
                    return; // Stay on current student
                }
            }
        }

        setSelectedStudent(student);
        setRelationMemo(''); // Reset memo
        if (relationMode === 'fixed') {
            setRelationMemo(student.fixed_class_memo || '');
            setTempFixedClass(student.fixed_class);
        }
    };

    const handleSaveRelationTargets = () => {
        if (!selectedStudent || !relationMode) return;

        const originalIds = relationMode === 'avoid' ? selectedStudent.avoid_ids : selectedStudent.keep_ids;

        const added = tempRelationTargetIds.filter(id => !originalIds.includes(id));
        const removed = originalIds.filter(id => !tempRelationTargetIds.includes(id));
        const unchanged = tempRelationTargetIds.filter(id => originalIds.includes(id));

        if (relationMode === 'avoid') {
            added.forEach(id => addAvoidRelation(selectedStudent.id, id, tempRelationMemos[id] || ''));
            removed.forEach(id => removeAvoidRelation(selectedStudent.id, id));
            // Update memo for unchanged relations
            unchanged.forEach(id => {
                if (tempRelationMemos[id]) {
                    addAvoidRelation(selectedStudent.id, id, tempRelationMemos[id]);
                }
            });
        } else if (relationMode === 'keep') {
            added.forEach(id => addKeepRelation(selectedStudent.id, id, tempRelationMemos[id] || ''));
            removed.forEach(id => removeKeepRelation(selectedStudent.id, id));
            // Update memo for unchanged relations
            unchanged.forEach(id => {
                if (tempRelationMemos[id]) {
                    addKeepRelation(selectedStudent.id, id, tempRelationMemos[id]);
                }
            });
        }

        setSelectedStudent(null);
        setTempRelationTargetIds([]);
        setTempRelationMemos({});
        setRelationMemo('');
    };

    const handleDeleteRelation = (studentAId: string, studentBId: string, mode: 'avoid' | 'keep') => {
        if (mode === 'avoid') {
            removeAvoidRelation(studentAId, studentBId);
        } else {
            removeKeepRelation(studentAId, studentBId);
        }
    };

    const handleBulkDeleteRelations = () => {
        if (selectedRelationsForDelete.size === 0) return;

        const confirmed = window.confirm(
            `선택한 ${selectedRelationsForDelete.size}개의 관계를 삭제하시겠습니까?`
        );
        if (!confirmed) return;

        selectedRelationsForDelete.forEach(key => {
            const [studentAId, studentBId] = key.split('|');
            if (relationMode === 'avoid') {
                removeAvoidRelation(studentAId, studentBId);
            } else if (relationMode === 'keep') {
                removeKeepRelation(studentAId, studentBId);
            }
        });
        setSelectedRelationsForDelete(new Set());
    };

    const toggleRelationSelection = (studentAId: string, studentBId: string) => {
        const key = `${studentAId}|${studentBId}`;
        setSelectedRelationsForDelete(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    const handleSaveFixedClass = () => {
        if (!selectedStudent) return;
        setFixedClass(selectedStudent.id, tempFixedClass, relationMemo);
        setSelectedStudent(null);
        setTempFixedClass(undefined);
        setRelationMemo('');
    };

    const handleSavePreTransfer = () => {
        students.forEach(student => {
            const isCurrentlyPreTransfer = student.is_pre_transfer || false;
            const shouldBePreTransfer = tempPreTransferIds.includes(student.id);

            if (isCurrentlyPreTransfer !== shouldBePreTransfer) {
                updateStudent(student.id, { is_pre_transfer: shouldBePreTransfer });
            }
        });
        // 저장 후 현재 탭에 머물러 있도록 relationMode를 변경하지 않음
    };


    const handleAddGroup = () => {
        if (newGroup.name) {
            if (groups.some(g => g.color === newGroup.color)) {
                alert('이미 사용 중인 색상입니다. 다른 색상을 선택해주세요.');
                return;
            }
            addGroup({
                name: newGroup.name,
                color: newGroup.color,
                member_ids: [],
            });
            setNewGroup({ name: '', color: GROUP_COLORS[0].value });
            setIsGroupDialogOpen(false);
        }
    };

    const handleEditGroup = () => {
        if (editingGroup && editingGroup.name) {
            if (groups.some(g => g.id !== editingGroup.id && g.color === editingGroup.color)) {
                alert('이미 사용 중인 색상입니다. 다른 색상을 선택해주세요.');
                return;
            }
            updateGroup(editingGroup.id, {
                name: editingGroup.name,
                color: editingGroup.color,
            });
            setEditingGroup(null);
            setIsGroupDialogOpen(false);
        }
    };

    const handleDeleteGroup = (groupId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('정말 이 그룹을 삭제하시겠습니까?\n삭제된 그룹은 복구할 수 없습니다.')) {
            deleteGroup(groupId);
            if (selectedGroupId === groupId) setSelectedGroupId(null);
            if (editingGroup?.id === groupId) {
                setEditingGroup(null);
                setIsGroupDialogOpen(false);
            }
        }
    };



    const onToggleTempPreTransfer = (studentId: string) => {
        setTempPreTransferIds(prev =>
            prev.includes(studentId)
                ? prev.filter(id => id !== studentId)
                : [...prev, studentId]
        );
    };

    const classNames = Array.from({ length: settings.classCount }, (_, i) => `${i + 1}반`);

    return (
        <div className="space-y-6 pb-20 relative">
            {/* 상단 통합 설정 영역 (삭제됨 - 항상 고급 모드 적용) */}

            {/* 상단 탭 버튼들 */}
            <div className="flex space-x-2 border-b pb-4 overflow-x-auto">
                <Button
                    variant={relationMode === null ? 'default' : 'outline'}
                    onClick={() => {
                        setRelationMode(null);
                        setSelectedStudent(null);
                    }}
                >
                    분산 배정 그룹 설정
                </Button>
                <Button
                    variant={relationMode === 'avoid' ? 'default' : 'outline'}
                    onClick={() => {
                        setRelationMode('avoid');
                        setSelectedStudent(null);
                    }}
                >
                    피해야 할 관계
                </Button>
                <Button
                    variant={relationMode === 'keep' ? 'default' : 'outline'}
                    onClick={() => {
                        setRelationMode('keep');
                        setSelectedStudent(null);
                    }}
                >
                    같은 반 희망
                </Button>
                <Button
                    variant={relationMode === 'fixed' ? 'default' : 'outline'}
                    onClick={() => {
                        setRelationMode('fixed');
                        setSelectedStudent(null);
                    }}
                >
                    고정 배정
                </Button>
                <Button
                    variant={relationMode === 'pretransfer' ? 'default' : 'outline'}
                    onClick={() => {
                        setRelationMode('pretransfer');
                        setSelectedStudent(null);
                    }}
                >
                    전출 예정
                </Button>
            </div>

            {/* 컨텐츠 영역 */}
            <div className="min-h-[500px]">
                {relationMode === null && (
                    <Card className="rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/80 backdrop-blur">
                        <CardHeader>
                            <CardTitle>분산 배정 그룹 관리</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* 안내 메시지 */}
                            <div className="bg-indigo-50 p-4 rounded-lg text-sm text-gray-700">
                                <h4 className="font-bold mb-2">💡 분산 배정 그룹 설정 안내</h4>
                                <ul className="list-disc list-inside space-y-1">
                                    <li><strong>분산 배정</strong>: 그룹 내 학생들을 모든 반에 고르게 배치합니다.</li>
                                    <li><strong>예시</strong>: '생활지도 유형' 그룹을 만들면, 해당 학생들이 한 반에 몰리지 않도록 배치됩니다.</li>
                                </ul>
                            </div>
                            <div className="flex gap-4">
                                {/* 그룹 목록 */}
                                <div className="w-1/3 border rounded-lg p-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="font-bold text-lg">그룹 목록</h3>
                                        <Button size="sm" onClick={() => {
                                            setEditingGroup(null);
                                            setNewGroup({ name: '', color: GROUP_COLORS[0].value });
                                            setIsGroupDialogOpen(true);
                                        }}>
                                            + 새 그룹
                                        </Button>
                                    </div>
                                    <div className="space-y-2">
                                        {groups.map(group => (
                                            <div
                                                key={group.id}
                                                className={`
                                                    p-3 rounded-lg border cursor-pointer transition-colors
                                                    ${selectedGroupId === group.id ? 'ring-2 ring-primary ring-offset-1 bg-accent/50' : 'hover:bg-accent bg-white'}
                                                `}
                                                onClick={() => setSelectedGroupId(group.id === selectedGroupId ? null : group.id)}
                                            >
                                                <div className="flex justify-between items-center mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-3 h-3 rounded-full shadow-sm ${group.color.split(' ')[0]}`} />
                                                        <span className="font-bold">{group.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => {
                                                                setNewGroup({ name: group.name, color: group.color });
                                                                setEditingGroup(group);
                                                                setIsGroupDialogOpen(true);
                                                            }}
                                                            className="h-8 w-8 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                                        >
                                                            <PencilSimple className="h-4 w-4" weight="duotone" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={(e) => handleDeleteGroup(group.id, e)}
                                                            className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                                        >
                                                            <Trash className="h-4 w-4" weight="duotone" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    멤버 {group.member_ids.length}명
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                                                    {students
                                                        .filter(s => group.member_ids.includes(s.id))
                                                        .map((s, index, array) => (
                                                            <span key={s.id} className="whitespace-nowrap">
                                                                {s.name}({s.prev_info}){index < array.length - 1 ? ',' : ''}
                                                            </span>
                                                        ))}
                                                </div>
                                            </div>
                                        ))}
                                        {groups.length === 0 && (
                                            <div className="text-center text-muted-foreground py-8">
                                                생성된 그룹이 없습니다.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 학생 선택 및 멤버 관리 */}
                                <div className="w-2/3 border rounded-lg p-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <div>
                                            <h3 className="font-bold text-lg">
                                                {selectedGroupId
                                                    ? `${groups.find(g => g.id === selectedGroupId)?.name} 멤버 관리`
                                                    : '그룹 멤버 관리'
                                                }
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                {selectedGroupId
                                                    ? '왼쪽 목록에서 학생을 선택하여 추가/제거하고 저장을 누르세요.'
                                                    : '왼쪽에서 그룹을 선택하면 멤버를 관리할 수 있습니다.'
                                                }
                                            </p>
                                        </div>
                                        {selectedGroupId && (
                                            <Button onClick={handleSaveGroupMembers}>
                                                저장 및 완료
                                            </Button>
                                        )}
                                    </div>
                                    {selectedGroupId ? (
                                        <div className="grid grid-cols-2 gap-4 h-[400px]">
                                            {/* 전체 학생 목록 */}
                                            <div className="border rounded-md p-2 flex flex-col h-full overflow-hidden">
                                                <div className="mb-2 flex justify-between items-center">
                                                    <span className="font-bold text-sm">전체 학생</span>
                                                    <Select
                                                        value={selectedClassFilter}
                                                        onValueChange={setSelectedClassFilter}
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
                                                    value={groupStudentSearch}
                                                    onChange={(e) => setGroupStudentSearch(e.target.value)}
                                                    className="h-8 text-sm mb-2"
                                                />
                                                <div className="flex-1 overflow-y-auto p-1">
                                                    {Object.entries(students
                                                        .filter(s => !tempMemberIds.includes(s.id))
                                                        .filter(s => selectedClassFilter === 'all' || s.prev_info.split('-')[1] === selectedClassFilter)
                                                        .filter(s => !groupStudentSearch || s.name.toLowerCase().includes(groupStudentSearch.toLowerCase()))
                                                        .reduce((acc, s) => {
                                                            const cls = s.prev_info.split('-')[1] || '기타';
                                                            if (!acc[cls]) acc[cls] = [];
                                                            acc[cls].push(s);
                                                            return acc;
                                                        }, {} as Record<string, typeof students>))
                                                        .sort((a, b) => {
                                                            if (a[0] === '기타') return 1;
                                                            if (b[0] === '기타') return -1;
                                                            return parseInt(a[0]) - parseInt(b[0]);
                                                        })
                                                        .map(([cls, classStudents]) => (
                                                            <div key={cls} className="mb-4 last:mb-0">
                                                                <div className="text-xs font-bold text-gray-500 mb-2 px-1 border-b pb-1 sticky top-0 bg-white z-10 flex justify-between">
                                                                    <span>{cls}반 (이전)</span>
                                                                    <span className="font-normal">{classStudents.length}명</span>
                                                                </div>
                                                                <div className="grid grid-cols-3 gap-2">
                                                                    {classStudents
                                                                        .sort((a, b) => {
                                                                            // 이름순 정렬 (번호가 있다면 번호순 권장하나, prev_info 파싱 복잡도 고려해 이름순)
                                                                            // prev_info: "4-1-15"
                                                                            const numA = parseInt(a.prev_info.split('-')[2] || '0');
                                                                            const numB = parseInt(b.prev_info.split('-')[2] || '0');
                                                                            if (numA !== numB) return numA - numB;
                                                                            return a.name.localeCompare(b.name);
                                                                        })
                                                                        .map(s => (
                                                                            <div
                                                                                key={s.id}
                                                                                className="p-2 hover:bg-accent rounded border cursor-pointer text-sm flex items-center justify-center gap-1 transition-colors"
                                                                                onClick={() => setTempMemberIds([...tempMemberIds, s.id])}
                                                                            >
                                                                                <span className="font-medium whitespace-nowrap">{s.name}</span>
                                                                                <span className="text-xs text-muted-foreground whitespace-nowrap">({s.prev_info.split('-')[2]})</span>
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            </div>
                                                        ))
                                                    }
                                                    {students.filter(s => !tempMemberIds.includes(s.id))
                                                        .filter(s => selectedClassFilter === 'all' || s.prev_info.split('-')[1] === selectedClassFilter)
                                                        .length === 0 && (
                                                            <div className="text-center text-gray-400 py-8">
                                                                선택 가능한 학생이 없습니다.
                                                            </div>
                                                        )}
                                                </div>
                                            </div>
                                            {/* 그룹 멤버 목록 */}
                                            <div className="border rounded-md p-2 flex flex-col h-full overflow-hidden">
                                                <div className="mb-2 font-bold text-sm">그룹 멤버 ({tempMemberIds.length}명)</div>
                                                <div className="flex-1 overflow-y-auto space-y-1 bg-gray-50 rounded-lg p-2 border">
                                                    {students
                                                        .filter(s => tempMemberIds.includes(s.id))
                                                        .sort((a, b) => {
                                                            // 반별, 번호순 정렬
                                                            const classA = parseInt(a.prev_info.split('-')[1] || '0');
                                                            const classB = parseInt(b.prev_info.split('-')[1] || '0');
                                                            if (classA !== classB) return classA - classB;
                                                            const numA = parseInt(a.prev_info.split('-')[2] || '0');
                                                            const numB = parseInt(b.prev_info.split('-')[2] || '0');
                                                            return numA - numB;
                                                        })
                                                        .map(s => (
                                                            <div
                                                                key={s.id}
                                                                className="p-2 hover:bg-accent/50 rounded cursor-pointer text-sm flex justify-between bg-white border items-center transition-colors"
                                                                onClick={() => setTempMemberIds(tempMemberIds.filter(id => id !== s.id))}
                                                            >
                                                                <span>{s.name} ({s.prev_info})</span>
                                                                <span className="text-destructive font-medium text-xs">제거</span>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-[400px] text-gray-400">
                                            왼쪽에서 그룹을 선택해주세요.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Relation Modes (Avoid, Keep) - Refactored UI */}
                {(relationMode === 'avoid' || relationMode === 'keep') && (
                    <Card className="rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/80 backdrop-blur">
                        <CardHeader>
                            <CardTitle>{relationMode === 'avoid' ? '피해야 할 관계 설정' : '같은 반 희망 설정'}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* 안내 메시지 */}
                            <div className="bg-indigo-50 p-4 rounded-lg text-sm text-gray-700">
                                <h4 className="font-bold mb-2">
                                    {relationMode === 'avoid' ? '💡 피해야 할 관계 설정 안내' : '💡 같은 반 희망 설정 안내'}
                                </h4>
                                <ul className="list-disc list-inside space-y-1">
                                    {relationMode === 'avoid' ? (
                                        <>
                                            <li><strong>분리 배치</strong>: 선택된 학생들은 반드시 다른 반에 배치됩니다.</li>
                                            <li><strong>예시</strong>: 학폭 사안으로 분리해야 하는 경우, 사이가 좋지 않은 경우</li>
                                        </>
                                    ) : (
                                        <>
                                            <li><strong>함께 배치</strong>: 선택된 학생들은 가능하면 같은 반에 배치됩니다.</li>
                                            <li><strong>예시</strong>: 담임 판단하에 생활지도상, 혹은 교우관계상 붙여줄 필요가 있다고 판단되는 경우</li>
                                        </>
                                    )}
                                </ul>
                            </div>
                            <div className="flex gap-4">
                                {/* 기준 학생 선택 */}
                                <div className="w-1/3 border rounded-lg p-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-bold text-lg">기준 학생 선택</h3>
                                        <Select
                                            value={baseStudentClassFilter}
                                            onValueChange={setBaseStudentClassFilter}
                                        >
                                            <SelectTrigger className="w-[100px] h-7 text-xs">
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
                                        value={baseStudentSearch}
                                        onChange={(e) => setBaseStudentSearch(e.target.value)}
                                        className="h-8 text-sm mb-2"
                                    />
                                    <div className="h-[420px] overflow-y-auto">
                                        {Object.entries(students
                                            .filter(s => baseStudentClassFilter === 'all' || s.prev_info.split('-')[1] === baseStudentClassFilter)
                                            .filter(s => !baseStudentSearch || s.name.toLowerCase().includes(baseStudentSearch.toLowerCase()))
                                            .reduce((acc, s) => {
                                                const cls = s.prev_info.split('-')[1] || '기타';
                                                if (!acc[cls]) acc[cls] = [];
                                                acc[cls].push(s);
                                                return acc;
                                            }, {} as Record<string, typeof students>))
                                            .sort((a, b) => {
                                                if (a[0] === '기타') return 1;
                                                if (b[0] === '기타') return -1;
                                                return parseInt(a[0]) - parseInt(b[0]);
                                            })
                                            .map(([cls, classStudents]) => (
                                                <div key={cls} className="mb-3 last:mb-0">
                                                    <div className="text-xs font-bold text-gray-500 mb-1 px-1 border-b pb-1 sticky top-0 bg-white z-10 flex justify-between">
                                                        <span>{cls}반 (이전)</span>
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
                                                                    className={`p-2 rounded border cursor-pointer text-sm flex items-center justify-center gap-1 transition-colors ${selectedStudent?.id === s.id ? 'bg-primary/10 ring-2 ring-primary border-primary' : 'hover:bg-accent border-gray-200'}`}
                                                                    onClick={() => handleSelectBaseStudent(s)}
                                                                >
                                                                    <span className="font-medium whitespace-nowrap">{s.name}</span>
                                                                    <span className="text-xs text-muted-foreground whitespace-nowrap">({s.prev_info.split('-')[2]})</span>
                                                                </div>
                                                            ))}
                                                    </div>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>

                                {/* 오른쪽 영역: 학생 선택 전/후에 따라 다른 내용 */}
                                <div className="w-2/3 border rounded-lg p-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <div>
                                            <h3 className="font-bold text-lg">
                                                {selectedStudent
                                                    ? `${selectedStudent.name}(${selectedStudent.prev_info}) 학생의 ${relationMode === 'avoid' ? '피해야 할' : '함께해야 할'} 관계 설정`
                                                    : `${relationMode === 'avoid' ? '피해야 할 관계' : '같은 반 희망'} 현황`
                                                }
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                {selectedStudent
                                                    ? '전체 학생에서 대상을 선택하고 저장하세요.'
                                                    : '왼쪽에서 기준 학생을 선택하여 관계를 설정하세요.'
                                                }
                                            </p>
                                        </div>
                                        {selectedStudent && (
                                            <Button onClick={handleSaveRelationTargets}>
                                                저장 및 완료
                                            </Button>
                                        )}
                                    </div>
                                    {selectedStudent ? (
                                        /* 기준 학생 선택됨: 3열 그리드 + 대상 박스 */
                                        <div className="grid grid-cols-2 gap-4 h-[420px]">
                                            {/* 전체 학생 목록 */}
                                            <div className="border rounded-md p-2 flex flex-col h-full overflow-hidden">
                                                <div className="mb-2 flex justify-between items-center">
                                                    <span className="font-bold text-sm">대상 학생</span>
                                                    <Select
                                                        value={targetStudentClassFilter}
                                                        onValueChange={setTargetStudentClassFilter}
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
                                                    value={targetStudentSearch}
                                                    onChange={(e) => setTargetStudentSearch(e.target.value)}
                                                    className="h-8 text-sm mb-2"
                                                />
                                                <div className="flex-1 overflow-y-auto p-1">
                                                    {Object.entries(students
                                                        .filter(s => s.id !== selectedStudent.id && !tempRelationTargetIds.includes(s.id))
                                                        .filter(s => targetStudentClassFilter === 'all' || s.prev_info.split('-')[1] === targetStudentClassFilter)
                                                        .filter(s => !targetStudentSearch || s.name.toLowerCase().includes(targetStudentSearch.toLowerCase()))
                                                        .reduce((acc, s) => {
                                                            const cls = s.prev_info.split('-')[1] || '기타';
                                                            if (!acc[cls]) acc[cls] = [];
                                                            acc[cls].push(s);
                                                            return acc;
                                                        }, {} as Record<string, typeof students>))
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
                                                                                onClick={() => setTempRelationTargetIds([...tempRelationTargetIds, s.id])}
                                                                            >
                                                                                <span className="font-medium whitespace-nowrap">{s.name}</span>
                                                                                <span className="text-xs text-muted-foreground whitespace-nowrap">({s.prev_info.split('-')[2]})</span>
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            </div>
                                            {/* 관계 대상 목록 */}
                                            <div className="border rounded-md p-2 flex flex-col h-full overflow-hidden">
                                                <div className="mb-2 font-bold text-sm">
                                                    {relationMode === 'avoid' ? '떨어져야 할 학생' : '함께해야 할 학생'} ({tempRelationTargetIds.length}명)
                                                </div>
                                                <div className="flex-1 overflow-y-auto space-y-2 bg-gray-50 rounded-lg p-2 border">
                                                    {students
                                                        .filter(s => tempRelationTargetIds.includes(s.id))
                                                        .map(s => (
                                                            <div
                                                                key={s.id}
                                                                className="p-2 rounded text-sm bg-white border hover:bg-accent/50 transition-colors"
                                                            >
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <span className="font-medium">{s.name} ({s.prev_info})</span>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 px-2 text-xs text-destructive hover:text-destructive/80 hover:bg-transparent"
                                                                        onClick={() => {
                                                                            setTempRelationTargetIds(tempRelationTargetIds.filter(id => id !== s.id));
                                                                            const newMemos = { ...tempRelationMemos };
                                                                            delete newMemos[s.id];
                                                                            setTempRelationMemos(newMemos);
                                                                        }}
                                                                    >
                                                                        제거
                                                                    </Button>
                                                                </div>
                                                                <Input
                                                                    placeholder="메모 (사유)..."
                                                                    value={tempRelationMemos[s.id] || ''}
                                                                    onChange={(e) => setTempRelationMemos({ ...tempRelationMemos, [s.id]: e.target.value })}
                                                                    className="h-7 text-xs bg-white"
                                                                />
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        /* 기준 학생 미선택: 현재 설정된 관계 요약 표시 (학급별 그룹) */
                                        <div className="h-[420px] overflow-y-auto">
                                            {getTotalRelationsCount(relationMode as 'keep' | 'avoid') > 0 ? (
                                                <div className="space-y-4">
                                                    {/* 일괄 선택/삭제 툴바 */}
                                                    <div className="sticky top-0 bg-white z-10 py-2 border-b flex justify-between items-center">
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={(() => {
                                                                    const allRelations = Object.values(getRelationsGroupedByClass(relationMode as 'keep' | 'avoid')).flat();
                                                                    return allRelations.length > 0 && allRelations.every(r =>
                                                                        selectedRelationsForDelete.has(`${r.studentA.id}|${r.studentB.id}`)
                                                                    );
                                                                })()}
                                                                onChange={(e) => {
                                                                    const allRelations = Object.values(getRelationsGroupedByClass(relationMode as 'keep' | 'avoid')).flat();
                                                                    if (e.target.checked) {
                                                                        const newSet = new Set(selectedRelationsForDelete);
                                                                        allRelations.forEach(r => newSet.add(`${r.studentA.id}|${r.studentB.id}`));
                                                                        setSelectedRelationsForDelete(newSet);
                                                                    } else {
                                                                        setSelectedRelationsForDelete(new Set());
                                                                    }
                                                                }}
                                                                className="h-4 w-4 rounded border-gray-300"
                                                            />
                                                            <span className="text-sm font-medium">전체 선택</span>
                                                        </label>
                                                        {selectedRelationsForDelete.size > 0 && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm text-gray-500">{selectedRelationsForDelete.size}개 선택</span>
                                                                <Button
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    onClick={handleBulkDeleteRelations}
                                                                >
                                                                    선택 삭제
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="bg-gray-50 rounded-lg p-2 border space-y-4 h-[350px] overflow-y-auto">
                                                        {Object.entries(getRelationsGroupedByClass(relationMode as 'keep' | 'avoid'))
                                                            .sort((a, b) => {
                                                                if (a[0] === '기타') return 1;
                                                                if (b[0] === '기타') return -1;
                                                                return parseInt(a[0]) - parseInt(b[0]);
                                                            })
                                                            .map(([cls, relations]) => {
                                                                const allClassSelected = relations.every(r =>
                                                                    selectedRelationsForDelete.has(`${r.studentA.id}|${r.studentB.id}`)
                                                                );
                                                                const toggleClassSelection = () => {
                                                                    const newSet = new Set(selectedRelationsForDelete);
                                                                    if (allClassSelected) {
                                                                        relations.forEach(r => newSet.delete(`${r.studentA.id}|${r.studentB.id}`));
                                                                    } else {
                                                                        relations.forEach(r => newSet.add(`${r.studentA.id}|${r.studentB.id}`));
                                                                    }
                                                                    setSelectedRelationsForDelete(newSet);
                                                                };
                                                                return (
                                                                    <div key={cls} className="bg-white rounded-md border p-2">
                                                                        <div className="text-xs font-bold text-gray-500 mb-2 px-1 border-b pb-1 flex items-center gap-2">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={allClassSelected}
                                                                                onChange={toggleClassSelection}
                                                                                className="h-3 w-3 rounded border-gray-300"
                                                                            />
                                                                            <span className="flex-1">{cls}반</span>
                                                                            <span className="font-normal">{relations.length}건</span>
                                                                        </div>
                                                                        <div className="grid grid-cols-2 gap-2">
                                                                            {relations.map(({ studentA, studentB, memo }, idx) => {
                                                                                const selectionKey = `${studentA.id}|${studentB.id}`;
                                                                                const isSelected = selectedRelationsForDelete.has(selectionKey);
                                                                                return (
                                                                                    <div
                                                                                        key={idx}
                                                                                        className={`py-1 px-2 rounded border text-sm flex items-center gap-2 ${isSelected ? 'bg-primary/10 border-primary' : 'bg-white hover:bg-accent'}`}
                                                                                    >
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={isSelected}
                                                                                            onChange={() => toggleRelationSelection(studentA.id, studentB.id)}
                                                                                            className="h-4 w-4 rounded border-gray-300"
                                                                                        />
                                                                                        <div className="flex-1 min-w-0">
                                                                                            <span className="text-xs">
                                                                                                {relationMode === 'keep' ? (
                                                                                                    <div className="flex items-center gap-1">
                                                                                                        <span>{studentA.name}({studentA.prev_info})</span>
                                                                                                        <Handshake size={14} className="text-indigo-400" weight="fill" />
                                                                                                        <span>{studentB.name}({studentB.prev_info})</span>
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <div className="flex items-center gap-1">
                                                                                                        <span>{studentA.name}({studentA.prev_info})</span>
                                                                                                        <ArrowsLeftRight size={14} className="text-red-400" />
                                                                                                        <span>{studentB.name}({studentB.prev_info})</span>
                                                                                                    </div>
                                                                                                )}
                                                                                            </span>
                                                                                            {memo && (
                                                                                                <span className="text-[10px] text-gray-400 ml-1">| {memo}</span>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="flex gap-1 shrink-0">
                                                                                            <Button
                                                                                                variant="ghost"
                                                                                                size="sm"
                                                                                                className="h-6 px-2 text-xs text-primary hover:text-primary/80 hover:bg-transparent"
                                                                                                onClick={() => handleSelectBaseStudent(studentA)}
                                                                                            >
                                                                                                수정
                                                                                            </Button>
                                                                                            <Button
                                                                                                variant="ghost"
                                                                                                size="sm"
                                                                                                className="h-6 px-2 text-xs text-destructive hover:text-destructive/80 hover:bg-transparent"
                                                                                                onClick={() => handleDeleteRelation(studentA.id, studentB.id, relationMode as 'keep' | 'avoid')}
                                                                                            >
                                                                                                삭제
                                                                                            </Button>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        }
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50 rounded-lg">
                                                    <p className="mb-1">
                                                        {relationMode === 'avoid' ? '설정된 피해야 할 관계가 없습니다.' : '설정된 같은 반 희망이 없습니다.'}
                                                    </p>
                                                    <p>왼쪽에서 기준 학생을 선택하여 추가하세요.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Fixed Assignment Mode */}
                {relationMode === 'fixed' && (
                    <Card className="rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/80 backdrop-blur">
                        <CardHeader>
                            <CardTitle>고정 배정 설정</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* 안내 메시지 */}
                            <div className="bg-indigo-50 p-4 rounded-lg text-sm text-gray-700">
                                <h4 className="font-bold mb-2">💡 고정 배정 설정 안내</h4>
                                <ul className="list-disc list-inside space-y-1">
                                    <li><strong>고정 배정</strong>: 선택된 학생을 특정 반에 반드시 배정합니다.</li>
                                </ul>
                            </div>
                            <div className="flex gap-4">
                                {/* 기준 학생 선택 */}
                                <div className="w-1/3 border rounded-lg p-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-bold text-lg">기준 학생 선택</h3>
                                        <Select
                                            value={selectedClassFilter}
                                            onValueChange={setSelectedClassFilter}
                                        >
                                            <SelectTrigger className="w-[80px] h-7 text-xs">
                                                <SelectValue placeholder="학급" />
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
                                        value={fixedStudentSearch}
                                        onChange={(e) => setFixedStudentSearch(e.target.value)}
                                        className="h-8 text-sm mb-2"
                                    />
                                    <div className="h-[420px] overflow-y-auto">
                                        {Object.entries(students
                                            .filter(s => selectedClassFilter === 'all' || s.prev_info.split('-')[1] === selectedClassFilter)
                                            .filter(s => !fixedStudentSearch || s.name.toLowerCase().includes(fixedStudentSearch.toLowerCase()))
                                            .reduce((acc, s) => {
                                                const cls = s.prev_info.split('-')[1] || '기타';
                                                if (!acc[cls]) acc[cls] = [];
                                                acc[cls].push(s);
                                                return acc;
                                            }, {} as Record<string, typeof students>))
                                            .sort((a, b) => {
                                                if (a[0] === '기타') return 1;
                                                if (b[0] === '기타') return -1;
                                                return parseInt(a[0]) - parseInt(b[0]);
                                            })
                                            .map(([cls, classStudents]) => (
                                                <div key={cls} className="mb-3 last:mb-0">
                                                    <div className="text-xs font-bold text-gray-500 mb-1 px-1 border-b pb-1 sticky top-0 bg-white z-10 flex justify-between">
                                                        <span>{cls}반</span>
                                                        <span className="font-normal">{classStudents.length}명</span>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {classStudents.map(s => (
                                                            <div
                                                                key={s.id}
                                                                className={`p-2 rounded border cursor-pointer text-sm flex items-center justify-center gap-1 transition-colors ${selectedStudent?.id === s.id ? 'bg-primary/10 ring-2 ring-primary border-primary' : 'hover:bg-accent border-gray-200'}`}
                                                                onClick={() => handleSelectBaseStudent(s)}
                                                            >
                                                                <div className="flex flex-col items-center gap-0.5 w-full">
                                                                    <div className="flex items-center justify-center gap-1 w-full">
                                                                        <span className="font-medium whitespace-nowrap">{s.name}</span>
                                                                        <span className="text-xs text-muted-foreground whitespace-nowrap">({s.prev_info.split('-')[2]})</span>
                                                                    </div>
                                                                    {s.fixed_class && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{s.fixed_class}</Badge>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>

                                {/* 오른쪽 영역 */}
                                <div className="w-2/3 border rounded-lg p-4">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="font-bold text-lg">
                                                {selectedStudent
                                                    ? `${selectedStudent.name}(${selectedStudent.prev_info}) 학생의 고정 배정`
                                                    : '고정 배정 설정'
                                                }
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                {selectedStudent
                                                    ? '특정 반에 고정 배정합니다.'
                                                    : '왼쪽에서 학생을 선택하세요.'
                                                }
                                            </p>
                                        </div>
                                        {selectedStudent && (
                                            <Button onClick={handleSaveFixedClass}>
                                                저장 및 완료
                                            </Button>
                                        )}
                                    </div>
                                    {selectedStudent ? (
                                        <div className="bg-gray-50 rounded-lg p-4 border space-y-4">
                                            <div className="grid grid-cols-4 gap-4">
                                                {classNames.map(cls => (
                                                    <Button
                                                        key={cls}
                                                        variant={tempFixedClass === cls ? 'default' : 'outline'}
                                                        className="h-20 text-lg"
                                                        onClick={() => setTempFixedClass(cls)}
                                                    >
                                                        {cls}
                                                    </Button>
                                                ))}
                                                <Button
                                                    variant={tempFixedClass === undefined ? 'secondary' : 'outline'}
                                                    className="h-20 text-lg"
                                                    onClick={() => setTempFixedClass(undefined)}
                                                >
                                                    고정 해제
                                                </Button>
                                            </div>
                                            <div className="space-y-2">
                                                <label>사유 (선택)</label>
                                                <Input
                                                    value={relationMemo}
                                                    onChange={(e) => setRelationMemo(e.target.value)}
                                                    placeholder="예: 쌍둥이 분리 배정 요청"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-[420px] overflow-y-auto bg-gray-50 rounded-lg p-2 border">
                                            {students.filter(s => s.fixed_class).length > 0 ? (
                                                <div className="space-y-4">
                                                    {/* 고정 배정된 반별 그룹화 */}
                                                    {Object.entries(students
                                                        .filter(s => s.fixed_class)
                                                        .reduce((acc, s) => {
                                                            const cls = s.fixed_class || '미지정';
                                                            if (!acc[cls]) acc[cls] = [];
                                                            acc[cls].push(s);
                                                            return acc;
                                                        }, {} as Record<string, typeof students>))
                                                        .sort((a, b) => {
                                                            const numA = parseInt(a[0].replace('반', ''));
                                                            const numB = parseInt(b[0].replace('반', ''));
                                                            return numA - numB;
                                                        })
                                                        .map(([cls, classStudents]) => (
                                                            <div key={cls}>
                                                                <div className="text-xs font-bold text-gray-500 mb-2 px-1 border-b pb-1 flex justify-between">
                                                                    <span>{cls} 고정</span>
                                                                    <span className="font-normal">{classStudents.length}명</span>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    {classStudents
                                                                        .sort((a, b) => {
                                                                            // 원래 반별, 번호순 정렬
                                                                            const classA = parseInt(a.prev_info.split('-')[1] || '0');
                                                                            const classB = parseInt(b.prev_info.split('-')[1] || '0');
                                                                            if (classA !== classB) return classA - classB;
                                                                            const numA = parseInt(a.prev_info.split('-')[2] || '0');
                                                                            const numB = parseInt(b.prev_info.split('-')[2] || '0');
                                                                            return numA - numB;
                                                                        })
                                                                        .map(s => (
                                                                            <div
                                                                                key={s.id}
                                                                                className="py-1 px-2 rounded border bg-white hover:bg-accent text-sm flex justify-between items-center"
                                                                            >
                                                                                <div className="flex items-center gap-2 min-w-0">
                                                                                    <span className="text-xs">{s.name}({s.prev_info})</span>
                                                                                    {s.fixed_class_memo && (
                                                                                        <span className="text-[10px] text-gray-400 truncate">| {s.fixed_class_memo}</span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex gap-1 shrink-0">
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="h-6 px-2 text-xs text-primary hover:text-primary/80 hover:bg-transparent"
                                                                                        onClick={() => handleSelectBaseStudent(s)}
                                                                                    >
                                                                                        수정
                                                                                    </Button>
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="h-6 px-2 text-xs text-destructive hover:text-destructive/80 hover:bg-transparent"
                                                                                        onClick={() => setFixedClass(s.id, undefined, '')}
                                                                                    >
                                                                                        해제
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                                    <p className="mb-1">고정 배정된 학생이 없습니다.</p>
                                                    <p>왼쪽에서 학생을 선택하여 고정 배정하세요.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* NEW: Pre-Transfer Mode */}
                {
                    relationMode === 'pretransfer' && (
                        <Card className="rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/80 backdrop-blur">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
                                <CardTitle>전출 예정 학생 관리</CardTitle>
                                <Button
                                    onClick={handleSavePreTransfer}
                                    disabled={!hasUnsavedPreTransferChanges()}
                                >
                                    저장 및 완료
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <PreTransferSettings
                                    students={students}
                                    tempPreTransferIds={tempPreTransferIds}
                                    onToggleTempPreTransfer={onToggleTempPreTransfer}
                                    hasUnsavedChanges={hasUnsavedPreTransferChanges()}
                                />
                            </CardContent>
                        </Card>
                    )
                }
            </div>

            {/* 그룹 추가/수정 다이얼로그 */}
            <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingGroup ? '그룹 수정' : '새 그룹 추가'}</DialogTitle>
                        <DialogDescription>분산 배정할 그룹 정보를 입력하세요.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">그룹명</label>
                            <Input
                                className="col-span-3"
                                value={editingGroup ? editingGroup.name : newGroup.name}
                                onChange={(e) => {
                                    if (editingGroup) setEditingGroup({ ...editingGroup, name: e.target.value });
                                    else setNewGroup({ ...newGroup, name: e.target.value });
                                }}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right">색상</label>
                            <Select
                                value={editingGroup ? editingGroup.color : newGroup.color}
                                onValueChange={(v) => {
                                    if (editingGroup) setEditingGroup({ ...editingGroup, color: v });
                                    else setNewGroup({ ...newGroup, color: v });
                                }}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {GROUP_COLORS.map((color) => {
                                        const isDisabled = groups.some(g =>
                                            g.color === color.value &&
                                            (!editingGroup || g.id !== editingGroup.id)
                                        );
                                        return (
                                            <SelectItem key={color.value} value={color.value} disabled={isDisabled}>
                                                <div className="flex items-center gap-2">
                                                    <Badge className={color.value}>{color.name}</Badge>
                                                    {isDisabled && <span className="text-xs text-muted-foreground">(사용중)</span>}
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <Button onClick={editingGroup ? handleEditGroup : handleAddGroup}>
                                {editingGroup ? '수정' : '추가'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex justify-between mt-8 border-t border-indigo-100 pt-6">
                <Button
                    variant="outline"
                    size="lg"
                    onClick={onBack}
                    className="rounded-xl border-slate-200 hover:bg-slate-50 hover:text-indigo-600"
                >
                    ← 이전: 기초 정보
                </Button>
                <Button
                    size="lg"
                    onClick={handleNext}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20"
                >
                    다음: 반편성 실행 →
                </Button>
            </div>
        </div >
    );
}
