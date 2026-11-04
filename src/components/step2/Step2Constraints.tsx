'use client';

import { useState, useEffect, useMemo, type MutableRefObject } from 'react';
import { useClasszleStore } from '@/lib/store';
import { CustomGroup, Student } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { ArrowsLeftRight, CheckCircle, Handshake, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpTip } from '@/components/common/HelpTip';
import { buildRelations } from '@/components/step3/boardModel';
import { StudentPicker } from './StudentPicker';
import { toast } from 'sonner';
import { useConfirm } from '@/components/shell/ConfirmProvider';


interface Step2ConstraintsProps {
    // 앱 틀이 이 단계를 떠나기 전에 부릅니다. 머무르기로 하면 false입니다.
    leaveGuard: MutableRefObject<(() => Promise<boolean>) | null>;
}

type Mode = 'group' | 'avoid' | 'keep' | 'fixed' | 'pretransfer';

// 조건 이름은 사용자가 정한 것입니다 (그룹 분산, 분리 배정, 함께 배정, 고정 배정, 전출 예정).
const TABS: { value: Mode; label: string }[] = [
    { value: 'group', label: '그룹 분산' },
    { value: 'avoid', label: '분리 배정' },
    { value: 'keep', label: '함께 배정' },
    { value: 'fixed', label: '고정 배정' },
    { value: 'pretransfer', label: '전출 예정' },
];

const TAB_HINTS: Record<Mode, { line: string; help: React.ReactNode }> = {
    group: {
        line: '그룹 학생을 모든 반에 고르게 나눕니다.',
        help: (
            <>
                <p>그룹을 만들고 학생을 넣으면, 그 학생들이 한 반에 몰리지 않게 나눕니다.</p>
                <p>예: 특수학급, 운동부처럼 반마다 비슷하게 있어야 하는 학생</p>
            </>
        ),
    },
    avoid: {
        line: '같은 반이 되면 안 되는 학생을 정합니다.',
        help: (
            <>
                <p>기준 학생을 고른 뒤 상대를 고르고 적용합니다. 고른 학생들은 다른 반에 배정합니다.</p>
                <p>예: 학교폭력 사안으로 떼어 놓아야 하는 경우, 사이가 좋지 않은 경우</p>
            </>
        ),
    },
    keep: {
        line: '같은 반에 두는 학생을 정합니다.',
        help: (
            <>
                <p>담임 판단으로 같은 반에 두는 학생입니다. 분리 배정 다음으로 지키는 조건이고, 어기면 위반으로 표시합니다.</p>
                <p>예: 생활지도나 교우관계 때문에 함께 두어야 한다고 판단한 경우</p>
            </>
        ),
    },
    fixed: {
        line: '학생을 정한 반에 꼭 배정합니다.',
        help: <p>왼쪽에서 학생을 고르고, 오른쪽에서 반을 고른 뒤 적용합니다. 고정 안 함을 고르면 풀립니다.</p>,
    },
    pretransfer: {
        line: '방학 중 전출할 학생을 고릅니다.',
        help: (
            <>
                <p><strong>균형 배정</strong>: 인원, 남녀, 성적은 전출 뒤 기준으로 맞추고, 전출 예정 학생은 반마다 고르게 나눕니다.</p>
                <p><strong>마지막 번호</strong>: 반 번호가 끊기지 않도록, 이름과 관계없이 그 반의 가장 마지막 번호를 받습니다.</p>
            </>
        ),
    },
};

function EmptyPanel({ children }: { children: React.ReactNode }) {
    return <p className="flex h-full min-h-40 items-center justify-center px-6 text-center text-small text-soft">{children}</p>;
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

export default function Step2Constraints({ leaveGuard }: Step2ConstraintsProps) {
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

    const confirm = useConfirm();
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
    const [tempMemberIds, setTempMemberIds] = useState<string[]>([]);
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

    // 고른 그룹의 학생을 넣거나 뺐는데 아직 저장하지 않았는지 봅니다.
    const hasUnsavedGroupChanges = () => {
        if (!selectedGroupId) return false;
        const group = groups.find((g) => g.id === selectedGroupId);
        if (!group) return false;
        return tempMemberIds.length !== group.member_ids.length || tempMemberIds.some((id) => !group.member_ids.includes(id));
    };

    // Check for any unsaved changes across all modes
    const hasAnyUnsavedChanges = () => {
        if (hasUnsavedGroupChanges()) return true; // Editing a group
        if (hasUnsavedRelationChanges()) return true; // Editing relations
        if (hasUnsavedFixedChanges()) return true; // Editing fixed assignment
        if (hasUnsavedPreTransferChanges()) return true; // Editing pre-transfer students
        return false;
    };

    // 단계를 떠날 때와 탭을 옮길 때 같은 확인 창으로 묻습니다.
    const confirmDiscard = async () => {
        if (!hasAnyUnsavedChanges()) return true;
        return confirm({
            title: '적용하지 않은 변경 사항이 있습니다.',
            description: '변경 사항을 버리고 이동할까요?',
            confirmLabel: '버리고 이동',
            cancelLabel: '이 화면에 머무르기',
            danger: true,
        });
    };

    // 사이드바, 이전, 다음 어느 길로 떠나도 앱 틀이 이 질문을 거칩니다.
    useEffect(() => {
        leaveGuard.current = confirmDiscard;
        return () => {
            leaveGuard.current = null;
        };
    });

    const handleSelectBaseStudent = async (student: Student) => {
        // Check for unsaved changes before switching
        if (selectedStudent && selectedStudent.id !== student.id) {
            if (hasUnsavedRelationChanges() || hasUnsavedFixedChanges()) {
                const confirmed = await confirm({
                    title: '적용하지 않은 변경 사항이 있습니다.',
                    description: '변경 사항을 버리고 다른 학생을 고를까요?',
                    confirmLabel: '버리고 선택',
                    cancelLabel: '이 학생 계속 편집',
                    danger: true,
                });
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

    // 같은 쌍에는 분리 배정과 함께 배정 중 하나만 둡니다. 반대 조건이 이미 있으면 바꿀지 묻습니다.
    // 바꾸기로 하면 적용할 때 반대 조건을 지웁니다(store의 linkPair).
    const pickRelationTarget = async (target: Student) => {
        if (!selectedStudent || (relationMode !== 'avoid' && relationMode !== 'keep')) return;
        const opposite = relationMode === 'avoid' ? relations.keep : relations.avoid;
        if (opposite.get(selectedStudent.id)?.includes(target.id)) {
            const was = relationMode === 'avoid' ? '함께 배정' : '분리 배정';
            const next = relationMode === 'avoid' ? '분리 배정' : '함께 배정';
            const ok = await confirm({
                title: `이미 ${was}인 학생입니다. ${next}으로 바꿀까요?`,
                description: `${selectedStudent.name} 학생과 ${target.name} 학생은 ${was}으로 정해 두었습니다. 한 쌍에는 한 가지 조건만 둘 수 있어, 바꾸면 적용할 때 ${was}은 지웁니다.`,
                confirmLabel: `${next}으로 바꾸기`,
                cancelLabel: `${was} 그대로 두기`,
            });
            if (!ok) return;
        }
        setTempRelationTargetIds((ids) => (ids.includes(target.id) ? ids : [...ids, target.id]));
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
            unchanged.forEach(id => addAvoidRelation(selectedStudent.id, id, tempRelationMemos[id] ?? ''));
        } else if (relationMode === 'keep') {
            added.forEach(id => addKeepRelation(selectedStudent.id, id, tempRelationMemos[id] || ''));
            removed.forEach(id => removeKeepRelation(selectedStudent.id, id));
            // Update memo for unchanged relations
            unchanged.forEach(id => addKeepRelation(selectedStudent.id, id, tempRelationMemos[id] ?? ''));
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

    const handleBulkDeleteRelations = async () => {
        if (selectedRelationsForDelete.size === 0) return;

        const confirmed = await confirm({
            title: `선택한 ${selectedRelationsForDelete.size}개의 관계를 지울까요?`,
            confirmLabel: '삭제',
            danger: true,
        });
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
                toast.error('이미 사용 중인 색상입니다. 다른 색상을 선택해 주세요.');
                return;
            }
            addGroup({
                name: newGroup.name,
                color: newGroup.color,
                member_ids: [],
            });
            setNewGroup({ name: '', color: GROUP_COLORS[0].value });
            setIsGroupDialogOpen(false);
            // 만든 그룹을 바로 골라 왼쪽에서 학생을 넣을 수 있게 합니다.
            const created = useClasszleStore.getState().groups.at(-1);
            if (created && !hasUnsavedGroupChanges()) setSelectedGroupId(created.id);
        }
    };

    const handleEditGroup = () => {
        if (editingGroup && editingGroup.name) {
            if (groups.some(g => g.id !== editingGroup.id && g.color === editingGroup.color)) {
                toast.error('이미 사용 중인 색상입니다. 다른 색상을 선택해 주세요.');
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

    const handleDeleteGroup = async (groupId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const confirmed = await confirm({
            title: '이 그룹을 지울까요?',
            description: '지운 그룹은 되돌릴 수 없습니다.',
            confirmLabel: '삭제',
            danger: true,
        });
        if (confirmed) {
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

    const relations = useMemo(() => buildRelations(students), [students]);
    // 탭에 보일 설정 개수입니다. 관계는 두 학생을 한 건으로 셉니다.
    const pairCount = (mode: 'avoid' | 'keep') => {
        const seen = new Set<string>();
        students.forEach((s) => (mode === 'avoid' ? s.avoid_ids : s.keep_ids).forEach((id) => {
            if (students.some((t) => t.id === id)) seen.add([s.id, id].sort().join('|'));
        }));
        return seen.size;
    };
    const counts: Record<Mode, number> = {
        group: groups.length,
        avoid: pairCount('avoid'),
        keep: pairCount('keep'),
        fixed: students.filter((s) => s.fixed_class).length,
        pretransfer: students.filter((s) => s.is_pre_transfer).length,
    };
    const tabValue: Mode = relationMode ?? 'group';
    // 탭을 옮길 때도 저장하지 않은 변경이 있으면 묻습니다. 버리면 고르던 그룹과 학생을 놓습니다.
    const handleTabChange = async (value: string) => {
        if (value === tabValue) return;
        if (!(await confirmDiscard())) return;
        setSelectedGroupId(null);
        setRelationMode(value === 'group' ? null : (value as Exclude<Mode, 'group'>));
        setSelectedStudent(null);
    };

    // 다른 그룹을 고를 때도 고르던 그룹의 변경을 묻습니다.
    const handleSelectGroup = async (groupId: string | null) => {
        if (groupId !== selectedGroupId && hasUnsavedGroupChanges()) {
            const confirmed = await confirm({
                title: '적용하지 않은 변경 사항이 있습니다.',
                description: '변경 사항을 버리고 다른 그룹을 고를까요?',
                confirmLabel: '버리고 선택',
                cancelLabel: '이 그룹 계속 편집',
                danger: true,
            });
            if (!confirmed) return;
        }
        setSelectedGroupId(groupId);
    };

    // 기준 학생을 놓을 때도 저장하지 않은 변경을 묻습니다.
    const handleClearBase = async () => {
        if (hasUnsavedRelationChanges() || hasUnsavedFixedChanges()) {
            const confirmed = await confirm({
                title: '적용하지 않은 변경 사항이 있습니다.',
                description: '변경 사항을 버리고 다른 학생을 고를까요?',
                confirmLabel: '버리고 선택',
                cancelLabel: '이 학생 계속 편집',
                danger: true,
            });
            if (!confirmed) return;
        }
        setSelectedStudent(null);
    };

    const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;
    const relationName = relationMode === 'avoid' ? '분리 배정' : '함께 배정';
    const nameWithInfo = (s: Student) => `${s.name}(${s.prev_info})`;
    const byClassNumber = (a: Student, b: Student) =>
        parseInt(a.prev_info.split('-')[1] || '0') - parseInt(b.prev_info.split('-')[1] || '0') ||
        parseInt(a.prev_info.split('-')[2] || '0') - parseInt(b.prev_info.split('-')[2] || '0');

    // ---- 탭마다 바뀌는 부분: 왼쪽 제목과 고르기, 오른쪽 제목과 내용, 저장 ----
    let leftTitle: React.ReactNode = '학생 고르기';
    let leftBody: React.ReactNode = null;
    let rightTitle: React.ReactNode = null;
    let rightTools: React.ReactNode = null;
    let rightBody: React.ReactNode = null;
    let save: { onClick: () => void; disabled: boolean } = { onClick: () => {}, disabled: true };

    if (relationMode === null) {
        leftTitle = selectedGroup ? <>&lsquo;{selectedGroup.name}&rsquo;에 넣을 학생</> : '학생 고르기';
        leftBody = selectedGroup ? (
            <StudentPicker
                students={students}
                relations={relations}
                multi
                pickedIds={new Set(tempMemberIds)}
                onPick={(s) => setTempMemberIds(tempMemberIds.includes(s.id) ? tempMemberIds.filter((id) => id !== s.id) : [...tempMemberIds, s.id])}
            />
        ) : (
            <EmptyPanel>오른쪽에서 그룹을 고르면 학생을 넣고 뺄 수 있습니다.</EmptyPanel>
        );
        rightTitle = <>그룹 {groups.length}개</>;
        rightTools = (
            <Button variant="outline" size="sm" onClick={() => {
                setEditingGroup(null);
                setNewGroup({ name: '', color: GROUP_COLORS[0].value });
                setIsGroupDialogOpen(true);
            }}>
                <Plus aria-hidden="true" />새 그룹
            </Button>
        );
        save = { onClick: handleSaveGroupMembers, disabled: !hasUnsavedGroupChanges() };
        rightBody = groups.length === 0 ? (
            <EmptyPanel>만든 그룹이 없습니다. 새 그룹을 눌러 만듭니다.</EmptyPanel>
        ) : (
            <ul className="divide-y divide-line" data-group-list>
                {groups.map((group) => {
                    const isSelected = selectedGroupId === group.id;
                    const memberIds = isSelected ? tempMemberIds : group.member_ids;
                    const members = students.filter((s) => memberIds.includes(s.id)).sort(byClassNumber);
                    return (
                        <li key={group.id} className={isSelected ? 'bg-wash' : ''}>
                            <div className="flex items-center gap-2 px-4 py-2">
                                <button
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => handleSelectGroup(isSelected ? null : group.id)}
                                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-input py-1 text-left focus-visible:outline-2"
                                >
                                    <span className={`size-3 shrink-0 rounded-full ${group.color.split(' ')[0]}`} aria-hidden="true" />
                                    <span className="font-semibold text-ink">{group.name}</span>
                                    <span className="text-small text-soft">학생 {members.length}명</span>
                                    {isSelected && <span className="text-caption font-semibold text-accent-ink">왼쪽에서 학생을 넣고 뺍니다</span>}
                                </button>
                                <Button variant="ghost" size="icon-sm" aria-label={`${group.name} 수정`} onClick={() => {
                                    setNewGroup({ name: group.name, color: group.color });
                                    setEditingGroup(group);
                                    setIsGroupDialogOpen(true);
                                }}>
                                    <PencilSimple aria-hidden="true" />
                                </Button>
                                <Button variant="ghost" size="icon-sm" aria-label={`${group.name} 삭제`} className="hover:bg-danger-wash hover:text-danger" onClick={(e) => handleDeleteGroup(group.id, e)}>
                                    <Trash aria-hidden="true" />
                                </Button>
                            </div>
                            {members.length > 0 && (
                                <p className="flex flex-wrap gap-x-2 gap-y-1 px-4 pb-2.5 pl-9 text-small text-soft">
                                    {members.map((s) => (
                                        <span key={s.id} className="inline-flex items-center gap-1 whitespace-nowrap">
                                            {nameWithInfo(s)}
                                            {isSelected && (
                                                <button type="button" aria-label={`${s.name} 빼기`} className="cursor-pointer rounded-input text-soft hover:text-danger" onClick={() => setTempMemberIds(tempMemberIds.filter((id) => id !== s.id))}>
                                                    <X size={12} aria-hidden="true" />
                                                </button>
                                            )}
                                        </span>
                                    ))}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ul>
        );
    } else if (relationMode === 'avoid' || relationMode === 'keep') {
        const RelationIcon = relationMode === 'keep' ? Handshake : ArrowsLeftRight;
        const iconClass = relationMode === 'keep' ? 'text-accent' : 'text-danger';
        if (selectedStudent) {
            leftTitle = (
                <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0">상대 고르기</span>
                    <span className="flex min-w-0 items-center gap-1 rounded-full bg-tint py-0.5 pr-1 pl-2 text-caption font-semibold text-accent-ink">
                        <span className="truncate">기준 {nameWithInfo(selectedStudent)}</span>
                        <button type="button" aria-label="기준 학생 바꾸기" onClick={handleClearBase} className="cursor-pointer rounded-full p-0.5 hover:bg-card">
                            <X size={12} aria-hidden="true" />
                        </button>
                    </span>
                </span>
            );
            leftBody = (
                <StudentPicker
                    students={students}
                    relations={relations}
                    multi
                    excludeIds={new Set([selectedStudent.id])}
                    pickedIds={new Set(tempRelationTargetIds)}
                    onPick={(s) => {
                        if (tempRelationTargetIds.includes(s.id)) {
                            setTempRelationTargetIds(tempRelationTargetIds.filter((id) => id !== s.id));
                            const newMemos = { ...tempRelationMemos };
                            delete newMemos[s.id];
                            setTempRelationMemos(newMemos);
                        } else {
                            void pickRelationTarget(s);
                        }
                    }}
                />
            );
            rightTitle = <>{nameWithInfo(selectedStudent)}의 {relationName} 상대 {tempRelationTargetIds.length}명</>;
            save = { onClick: handleSaveRelationTargets, disabled: !hasUnsavedRelationChanges() };
            rightBody = tempRelationTargetIds.length === 0 ? (
                <EmptyPanel>왼쪽에서 상대를 고릅니다. 여러 명을 고를 수 있습니다.</EmptyPanel>
            ) : (
                <ul className="divide-y divide-line" data-relation-targets>
                    {students.filter((s) => tempRelationTargetIds.includes(s.id)).map((s) => (
                        <li key={s.id} className="flex items-center gap-2 px-4 py-2">
                            <RelationIcon size={15} className={`shrink-0 ${iconClass}`} aria-hidden="true" />
                            <span className="w-40 shrink-0 truncate font-medium text-ink">{nameWithInfo(s)}</span>
                            <Input
                                placeholder="사유 (선택)"
                                aria-label={`${s.name} 사유`}
                                value={tempRelationMemos[s.id] || ''}
                                onChange={(e) => setTempRelationMemos({ ...tempRelationMemos, [s.id]: e.target.value })}
                                className="h-8 flex-1 text-small"
                            />
                            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-wash hover:text-danger" onClick={() => {
                                setTempRelationTargetIds(tempRelationTargetIds.filter((id) => id !== s.id));
                                const newMemos = { ...tempRelationMemos };
                                delete newMemos[s.id];
                                setTempRelationMemos(newMemos);
                            }}>
                                빼기
                            </Button>
                        </li>
                    ))}
                </ul>
            );
        } else {
            leftTitle = '기준 학생 고르기';
            leftBody = (
                <StudentPicker students={students} relations={relations} pickedIds={new Set()} onPick={handleSelectBaseStudent} />
            );
            const grouped = getRelationsGroupedByClass(relationMode);
            const allRelations = Object.values(grouped).flat();
            const allSelected = allRelations.length > 0 && allRelations.every((r) => selectedRelationsForDelete.has(`${r.studentA.id}|${r.studentB.id}`));
            rightTitle = <>{relationName} {counts[relationMode]}건</>;
            rightTools = selectedRelationsForDelete.size > 0 ? (
                <Button variant="destructive" size="sm" onClick={handleBulkDeleteRelations}>
                    고른 {selectedRelationsForDelete.size}건 삭제
                </Button>
            ) : null;
            rightBody = allRelations.length === 0 ? (
                <EmptyPanel>{relationMode === 'avoid' ? '설정된 분리 배정이 없습니다.' : '설정된 함께 배정이 없습니다.'} 왼쪽에서 기준 학생을 고릅니다.</EmptyPanel>
            ) : (
                <div data-relation-list>
                    <label className="sticky top-0 z-[1] flex cursor-pointer items-center gap-2 border-b border-line bg-card px-4 py-2 text-small text-soft">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={(e) => {
                                if (e.target.checked) {
                                    const newSet = new Set(selectedRelationsForDelete);
                                    allRelations.forEach((r) => newSet.add(`${r.studentA.id}|${r.studentB.id}`));
                                    setSelectedRelationsForDelete(newSet);
                                } else {
                                    setSelectedRelationsForDelete(new Set());
                                }
                            }}
                            className="size-4 accent-accent"
                        />
                        전체 고르기
                    </label>
                    {Object.entries(grouped)
                        .sort((a, b) => (a[0] === '기타' ? 1 : b[0] === '기타' ? -1 : parseInt(a[0]) - parseInt(b[0])))
                        .map(([cls, list]) => {
                            const allClassSelected = list.every((r) => selectedRelationsForDelete.has(`${r.studentA.id}|${r.studentB.id}`));
                            return (
                                <section key={cls}>
                                    <label className="flex cursor-pointer items-center gap-2 border-b border-line bg-canvas px-4 py-1 text-caption text-soft">
                                        <input
                                            type="checkbox"
                                            checked={allClassSelected}
                                            onChange={() => {
                                                const newSet = new Set(selectedRelationsForDelete);
                                                list.forEach((r) => (allClassSelected ? newSet.delete(`${r.studentA.id}|${r.studentB.id}`) : newSet.add(`${r.studentA.id}|${r.studentB.id}`)));
                                                setSelectedRelationsForDelete(newSet);
                                            }}
                                            className="size-3.5 accent-accent"
                                        />
                                        <span className="flex-1 font-semibold">{cls === '기타' ? '반 정보 없음' : `${cls}반`}</span>
                                        <span>{list.length}건</span>
                                    </label>
                                    <ul className="divide-y divide-line">
                                        {list.map(({ studentA, studentB, memo }, idx) => {
                                            const key = `${studentA.id}|${studentB.id}`;
                                            const isSelected = selectedRelationsForDelete.has(key);
                                            return (
                                                <li key={idx} className={`flex items-center gap-2 px-4 py-1.5 text-small ${isSelected ? 'bg-wash' : 'hover:bg-wash'}`}>
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`${studentA.name}, ${studentB.name} 고르기`}
                                                        checked={isSelected}
                                                        onChange={() => toggleRelationSelection(studentA.id, studentB.id)}
                                                        className="size-4 accent-accent"
                                                    />
                                                    <span className="text-ink">{nameWithInfo(studentA)}</span>
                                                    <RelationIcon size={14} className={iconClass} aria-hidden="true" />
                                                    <span className="text-ink">{nameWithInfo(studentB)}</span>
                                                    {memo && <span className="min-w-0 truncate text-caption text-soft">· {memo}</span>}
                                                    <span className="ml-auto flex shrink-0 gap-1">
                                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-accent hover:text-accent-ink" onClick={() => handleSelectBaseStudent(studentA)}>수정</Button>
                                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-danger hover:bg-danger-wash hover:text-danger" onClick={() => handleDeleteRelation(studentA.id, studentB.id, relationMode)}>삭제</Button>
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            );
                        })}
                </div>
            );
        }
    } else if (relationMode === 'fixed') {
        leftTitle = '학생 고르기';
        leftBody = (
            <StudentPicker
                students={students}
                relations={relations}
                pickedIds={new Set(selectedStudent ? [selectedStudent.id] : [])}
                onPick={handleSelectBaseStudent}
            />
        );
        if (selectedStudent) {
            rightTitle = <>{nameWithInfo(selectedStudent)} 고정 배정</>;
            rightTools = (
                <Button variant="ghost" size="sm" onClick={handleClearBase}>목록으로</Button>
            );
            save = { onClick: handleSaveFixedClass, disabled: !hasUnsavedFixedChanges() };
            rightBody = (
                <div className="space-y-4 p-4">
                    <div>
                        <p className="mb-2 text-small font-semibold text-ink">꼭 배정할 반</p>
                        <div role="radiogroup" aria-label="고정할 반" className="flex flex-wrap gap-1.5">
                            {classNames.map((cls) => (
                                <button
                                    key={cls}
                                    type="button"
                                    role="radio"
                                    aria-checked={tempFixedClass === cls}
                                    onClick={() => setTempFixedClass(cls)}
                                    className={`h-9 min-w-14 cursor-pointer rounded-button border px-3 text-body tabular-nums transition-colors focus-visible:outline-2 ${
                                        tempFixedClass === cls ? 'border-accent bg-wash font-bold text-accent-ink ring-1 ring-accent' : 'border-hairline bg-card text-ink hover:border-ring hover:bg-wash'
                                    }`}
                                >
                                    {cls}
                                </button>
                            ))}
                            <button
                                type="button"
                                role="radio"
                                aria-checked={tempFixedClass === undefined}
                                onClick={() => setTempFixedClass(undefined)}
                                className={`h-9 cursor-pointer rounded-button border px-3 text-body transition-colors focus-visible:outline-2 ${
                                    tempFixedClass === undefined ? 'border-accent bg-wash font-bold text-accent-ink ring-1 ring-accent' : 'border-hairline bg-card text-soft hover:border-ring hover:bg-wash'
                                }`}
                            >
                                고정 안 함
                            </button>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="fixed-memo" className="text-small font-semibold text-ink">사유 (선택)</label>
                        <Input id="fixed-memo" value={relationMemo} onChange={(e) => setRelationMemo(e.target.value)} placeholder="예: 특수학급 연계" />
                    </div>
                </div>
            );
        } else {
            const fixedStudents = students.filter((s) => s.fixed_class);
            rightTitle = <>고정 배정 {fixedStudents.length}명</>;
            rightBody = fixedStudents.length === 0 ? (
                <EmptyPanel>고정 배정한 학생이 없습니다. 왼쪽에서 학생을 고릅니다.</EmptyPanel>
            ) : (
                <div data-fixed-list>
                    {Object.entries(fixedStudents.reduce((acc, s) => {
                        const cls = s.fixed_class || '미지정';
                        (acc[cls] ??= []).push(s);
                        return acc;
                    }, {} as Record<string, Student[]>))
                        .sort((a, b) => parseInt(a[0].replace('반', '')) - parseInt(b[0].replace('반', '')))
                        .map(([cls, list]) => (
                            <section key={cls}>
                                <div className="flex justify-between border-b border-line bg-canvas px-4 py-1 text-caption text-soft">
                                    <span className="font-semibold">{cls} 고정</span>
                                    <span>{list.length}명</span>
                                </div>
                                <ul className="divide-y divide-line">
                                    {list.sort(byClassNumber).map((s) => (
                                        <li key={s.id} className="flex items-center gap-2 px-4 py-1.5 text-small hover:bg-wash">
                                            <span className="text-ink">{nameWithInfo(s)}</span>
                                            {s.fixed_class_memo && <span className="min-w-0 truncate text-caption text-soft">· {s.fixed_class_memo}</span>}
                                            <span className="ml-auto flex shrink-0 gap-1">
                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-accent hover:text-accent-ink" onClick={() => handleSelectBaseStudent(s)}>수정</Button>
                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-danger hover:bg-danger-wash hover:text-danger" onClick={() => setFixedClass(s.id, undefined, '')}>해제</Button>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                </div>
            );
        }
    } else {
        // 전출 예정
        const preTransferStudents = students.filter((s) => tempPreTransferIds.includes(s.id)).sort(byClassNumber);
        const unsaved = hasUnsavedPreTransferChanges();
        leftTitle = '전출할 학생 고르기';
        leftBody = (
            <StudentPicker students={students} relations={relations} multi pickedIds={new Set(tempPreTransferIds)} onPick={(s) => onToggleTempPreTransfer(s.id)} />
        );
        rightTitle = (
            <span className="flex items-center gap-2">
                전출 예정 {preTransferStudents.length}명
                {!unsaved && preTransferStudents.length > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-wash px-2 py-0.5 text-caption font-medium text-accent-ink">
                        <CheckCircle size={14} aria-hidden="true" />적용됨
                    </span>
                )}
            </span>
        );
        save = { onClick: handleSavePreTransfer, disabled: !unsaved };
        rightBody = preTransferStudents.length === 0 ? (
            <EmptyPanel>왼쪽에서 학생을 눌러 전출 예정에 넣습니다.</EmptyPanel>
        ) : (
            <ul className="divide-y divide-line" data-pretransfer-list>
                {preTransferStudents.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-4 py-1.5 text-small hover:bg-wash">
                        <span className="text-ink">{nameWithInfo(s)}</span>
                        <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-danger hover:bg-danger-wash hover:text-danger" onClick={() => onToggleTempPreTransfer(s.id)}>해제</Button>
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <div className="flex h-full min-h-[460px] flex-col gap-3">
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
                <Tabs value={tabValue} onValueChange={handleTabChange}>
                    <TabsList aria-label="조건" className="h-9">
                        {TABS.map((tab) => (
                            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 px-3">
                                {tab.label}
                                <span className={`text-caption font-normal tabular-nums ${counts[tab.value] > 0 ? 'text-accent-ink' : 'text-soft'}`}>{counts[tab.value]}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
                <p className="flex items-center gap-1 text-small text-soft" data-step2-hint>
                    {TAB_HINTS[tabValue].line}
                    <HelpTip label={TABS.find((t) => t.value === tabValue)!.label} width={360}>{TAB_HINTS[tabValue].help}</HelpTip>
                </p>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,400px)_minmax(0,1fr)] gap-3">
                <section aria-label="학생 고르기" className="flex min-h-0 flex-col overflow-hidden rounded-card bg-card shadow-card">
                    <h3 className="flex h-12 shrink-0 items-center border-b border-line px-4 text-body font-bold text-ink">{leftTitle}</h3>
                    {leftBody}
                </section>
                <section aria-label="설정한 것" className="flex min-h-0 flex-col overflow-hidden rounded-card bg-card shadow-card">
                    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-3 pl-4">
                        <h3 className="min-w-0 flex-1 truncate text-body font-bold text-ink">{rightTitle}</h3>
                        {rightTools}
                        {/* 작업 파일 저장(사이드바)과 헷갈리지 않게 '적용'이라고 씁니다. */}
                        <Button size="sm" onClick={save.onClick} disabled={save.disabled} data-step2-save>
                            적용
                        </Button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">{rightBody}</div>
                </section>
            </div>

            {/* 그룹 추가/수정 다이얼로그 */}
            <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingGroup ? '그룹 수정' : '새 그룹 추가'}</DialogTitle>
                        <DialogDescription>모든 반에 고르게 나눌 그룹의 정보를 입력해 주세요.</DialogDescription>
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
                                                    {isDisabled && <span className="text-caption text-soft">(사용중)</span>}
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
        </div>
    );
}
