'use client';

import { useState } from 'react';
import { useClasszleStore } from '@/lib/store';
import { Student, BehaviorType, Gender } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

export default function StudentManagement() {
    const { students, updateStudent, addStudent, deleteStudent } = useClasszleStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newStudent, setNewStudent] = useState<Partial<Student>>({
        name: '',
        prev_info: '',
        gender: 'M',
        academic_score: 500,
        behavior_score: 0,
        behavior_type: 'NONE',
    });

    const filteredStudents = students.filter(
        (s) =>
            s.name.includes(searchTerm) ||
            s.prev_info.includes(searchTerm)
    );

    const sortedStudents = [...filteredStudents].sort((a, b) => {
        // ?¥Ï†Ñ?ôÎÖÑ ?ïÎ≥¥Î°??ïÎ†¨ (?? 3-1-1 < 3-1-2 < 3-2-1)
        return a.prev_info.localeCompare(b.prev_info, 'ko');
    });

    const handleAddStudent = () => {
        if (newStudent.name) {
            addStudent({
                name: newStudent.name,
                prev_info: newStudent.prev_info || '',
                gender: (newStudent.gender as Gender) || 'M',
                academic_score: newStudent.academic_score || 500,
                behavior_score: newStudent.behavior_score || 0,
                behavior_type: (newStudent.behavior_type as BehaviorType) || 'NONE',
                behavior_note: '',
                group_ids: [],
                avoid_ids: [],
                keep_ids: [],
                fixed_class: undefined,
                assigned_class: null,
            });
            setNewStudent({
                name: '',
                prev_info: '',
                gender: 'M',
                academic_score: 500,
                behavior_score: 0,
                behavior_type: 'NONE',
            });
            setIsAddDialogOpen(false);
        }
    };

    const getBehaviorColor = (type: BehaviorType, score: number) => {
        if (type === 'NONE') return 'bg-gray-100';
        if (type === 'LEADER') return score <= -1 ? 'bg-green-200' : 'bg-green-100';
        if (type === 'BEHAVIOR') {
            if (score >= 3) return 'bg-orange-300';
            if (score >= 2) return 'bg-orange-200';
            return 'bg-orange-100';
        }
        if (type === 'EMOTIONAL') {
            if (score >= 3) return 'bg-blue-300';
            if (score >= 2) return 'bg-blue-200';
            return 'bg-blue-100';
        }
        return 'bg-gray-100';
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        ?ìã ?ôÏÉù Í¥ÄÎ¶?
                        <span className="text-sm font-normal text-muted-foreground">
                            (Ï¥?{students.length}Î™?
                        </span>
                    </CardTitle>
                    <div className="flex items-center gap-4">
                        <Input
                            placeholder="?¥Î¶Ñ ?êÎäî ?¥Ï†Ñ?ôÎÖÑ Í≤Ä??.."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-64"
                        />
                        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                            <DialogTrigger asChild>
                                <Button>+ ?ôÏÉù Ï∂îÍ?</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>???ôÏÉù Ï∂îÍ?</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <label className="text-right">?¥Î¶Ñ</label>
                                        <Input
                                            className="col-span-3"
                                            value={newStudent.name}
                                            onChange={(e) =>
                                                setNewStudent({ ...newStudent, name: e.target.value })
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <label className="text-right">?¥Ï†Ñ?ôÎÖÑ</label>
                                        <Input
                                            className="col-span-3"
                                            placeholder="3-2-15"
                                            value={newStudent.prev_info}
                                            onChange={(e) =>
                                                setNewStudent({ ...newStudent, prev_info: e.target.value })
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <label className="text-right">?±Î≥Ñ</label>
                                        <Select
                                            value={newStudent.gender}
                                            onValueChange={(v) =>
                                                setNewStudent({ ...newStudent, gender: v as Gender })
                                            }
                                        >
                                            <SelectTrigger className="col-span-3">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="M">??/SelectItem>
                                                <SelectItem value="F">??/SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <label className="text-right">?±Ï†Å</label>
                                        <Input
                                            className="col-span-3"
                                            type="number"
                                            min={1}
                                            max={1000}
                                            value={newStudent.academic_score}
                                            onChange={(e) =>
                                                setNewStudent({
                                                    ...newStudent,
                                                    academic_score: parseInt(e.target.value) || 500,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <label className="text-right">?ùÌôúÏßÄ???êÏàò</label>
                                        <Input
                                            className="col-span-3"
                                            type="number"
                                            min={-2}
                                            max={3}
                                            value={newStudent.behavior_score}
                                            onChange={(e) =>
                                                setNewStudent({
                                                    ...newStudent,
                                                    behavior_score: parseInt(e.target.value) || 0,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <label className="text-right">?ùÌôúÏßÄ???†Ìòï</label>
                                        <Select
                                            value={newStudent.behavior_type}
                                            onValueChange={(v) =>
                                                setNewStudent({
                                                    ...newStudent,
                                                    behavior_type: v as BehaviorType,
                                                })
                                            }
                                        >
                                            <SelectTrigger className="col-span-3">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NONE">?¥Îãπ?ÜÏùå</SelectItem>
                                                <SelectItem value="LEADER">Î¶¨Îçî??/SelectItem>
                                                <SelectItem value="BEHAVIOR">?âÎèô??/SelectItem>
                                                <SelectItem value="EMOTIONAL">?ïÏÑú??/SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                        Ï∑®ÏÜå
                                    </Button>
                                    <Button onClick={handleAddStudent}>Ï∂îÍ?</Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border overflow-auto max-h-[600px]">
                    <Table>
                        <TableHeader className="sticky top-0 bg-background">
                            <TableRow>
                                <TableHead className="w-[80px]">Î≤àÌò∏</TableHead>
                                <TableHead>?¥Î¶Ñ</TableHead>
                                <TableHead>?¥Ï†Ñ?ôÎÖÑ</TableHead>
                                <TableHead>?±Î≥Ñ</TableHead>
                                <TableHead>?±Ï†Å</TableHead>
                                <TableHead>?ùÌôúÏßÄ??/TableHead>
                                <TableHead>?†Ìòï</TableHead>
                                <TableHead>Î∞∞Ï†ïÎ∞?/TableHead>
                                <TableHead className="w-[100px]">?°ÏÖò</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedStudents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                        ?ôÏÉù ?∞Ïù¥?∞Í? ?ÜÏäµ?àÎã§. Step 1?êÏÑú ?ëÏ? ?åÏùº???ÖÎ°ú?úÌïòÍ±∞ÎÇò ?ôÏÉù??Ï∂îÍ??òÏÑ∏??
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sortedStudents.map((student, index) => (
                                    <TableRow
                                        key={student.id}
                                        className={getBehaviorColor(student.behavior_type, student.behavior_score)}
                                    >
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>
                                            {editingId === student.id ? (
                                                <Input
                                                    value={student.name}
                                                    onChange={(e) =>
                                                        updateStudent(student.id, { name: e.target.value })
                                                    }
                                                    className="w-24"
                                                />
                                            ) : (
                                                <span className="font-medium">{student.name}</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {editingId === student.id ? (
                                                <Input
                                                    value={student.prev_info}
                                                    onChange={(e) =>
                                                        updateStudent(student.id, { prev_info: e.target.value })
                                                    }
                                                    className="w-24"
                                                />
                                            ) : (
                                                student.prev_info
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {editingId === student.id ? (
                                                <Select
                                                    value={student.gender}
                                                    onValueChange={(v) =>
                                                        updateStudent(student.id, { gender: v as Gender })
                                                    }
                                                >
                                                    <SelectTrigger className="w-16">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="M">??/SelectItem>
                                                        <SelectItem value="F">??/SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                student.gender === 'M' ? '?? : '??
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {editingId === student.id ? (
                                                <Input
                                                    type="number"
                                                    value={student.academic_score}
                                                    onChange={(e) =>
                                                        updateStudent(student.id, {
                                                            academic_score: parseInt(e.target.value) || 0,
                                                        })
                                                    }
                                                    className="w-20"
                                                />
                                            ) : (
                                                student.academic_score
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {editingId === student.id ? (
                                                <Input
                                                    type="number"
                                                    min={-2}
                                                    max={3}
                                                    value={student.behavior_score}
                                                    onChange={(e) =>
                                                        updateStudent(student.id, {
                                                            behavior_score: parseInt(e.target.value) || 0,
                                                        })
                                                    }
                                                    className="w-16"
                                                />
                                            ) : (
                                                student.behavior_score
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {editingId === student.id ? (
                                                <Select
                                                    value={student.behavior_type}
                                                    onValueChange={(v) =>
                                                        updateStudent(student.id, {
                                                            behavior_type: v as BehaviorType,
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger className="w-24">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="NONE">?¥Îãπ?ÜÏùå</SelectItem>
                                                        <SelectItem value="LEADER">Î¶¨Îçî??/SelectItem>
                                                        <SelectItem value="BEHAVIOR">?âÎèô??/SelectItem>
                                                        <SelectItem value="EMOTIONAL">?ïÏÑú??/SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <span className="text-sm">
                                                    {student.behavior_type === 'NONE' && '-'}
                                                    {student.behavior_type === 'LEADER' && '?ü¢ Î¶¨Îçî'}
                                                    {student.behavior_type === 'BEHAVIOR' && '?ü† ?âÎèô'}
                                                    {student.behavior_type === 'EMOTIONAL' && '?îµ ?ïÏÑú'}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {student.assigned_class || '-'}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                {editingId === student.id ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setEditingId(null)}
                                                    >
                                                        ?ÑÎ£å
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setEditingId(student.id)}
                                                    >
                                                        ?èÔ∏è
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-destructive"
                                                    onClick={() => deleteStudent(student.id)}
                                                >
                                                    ?óëÔ∏?
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
