// 저장된 작업 목록. Electron에서는 앱 자료 폴더에, 브라우저에서는 localStorage에 저장합니다.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { overwritesOtherProject, resolveSaveName } from '../../../main/projectName';
import { parseProjectFile } from '@/lib/projectFile';
import { useClasszleStore } from '@/lib/store';
import { useConfirm } from './ConfirmProvider';

export type SavedProjects = ReturnType<typeof useSavedProjects>;

const LIST_KEY = 'classzle_project_list';
const dataKey = (name: string) => `classzle_project_data_${name}`;

function readBrowserList(): string[] {
    const stored = localStorage.getItem(LIST_KEY);
    return stored ? JSON.parse(stored) : [];
}

const storage = {
    list: async (): Promise<string[]> =>
        window.electronAPI ? window.electronAPI.getProjectList() : readBrowserList(),
    read: async (name: string): Promise<string | null> =>
        window.electronAPI ? window.electronAPI.loadNamedProject(name) : localStorage.getItem(dataKey(name)),
    write: async (name: string, data: string): Promise<boolean | 'locked'> => {
        if (window.electronAPI) return window.electronAPI.saveNamedProject(name, data);
        localStorage.setItem(dataKey(name), data);
        const list = readBrowserList();
        if (!list.includes(name)) localStorage.setItem(LIST_KEY, JSON.stringify([...list, name]));
        return true;
    },
    remove: async (name: string): Promise<boolean> => {
        if (window.electronAPI) return window.electronAPI.deleteProject(name);
        localStorage.removeItem(dataKey(name));
        localStorage.setItem(LIST_KEY, JSON.stringify(readBrowserList().filter((n) => n !== name)));
        return true;
    },
};

const DISCARD_WARNING = {
    title: '이 작업을 불러올까요?',
    description: '지금 작업 중인 내용 가운데 저장하지 않은 것은 사라집니다.',
    confirmLabel: '불러오기',
};

export function useSavedProjects({ onLoaded }: { onLoaded: () => void }) {
    const { students, groups, settings, movementHistory, loadProject, setNotices, workId } = useClasszleStore();
    const confirm = useConfirm();
    const [names, setNames] = useState<string[]>([]);
    const [activeName, setActiveName] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setNames(await storage.list());
        } catch (e) {
            console.error('Failed to get project list:', e);
            setNames([]);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // 새 명단이나 전체 초기화는 다른 작업입니다. 예전 이름으로 저장해도 묻지 않는 일이 없도록 잊습니다.
    useEffect(() => {
        setActiveName(null);
    }, [workId]);

    /** 저장에 성공하면 true입니다. */
    const save = async (rawName: string): Promise<boolean> => {
        const typed = rawName.trim();
        // 윈도우에서 Test와 test는 같은 파일이므로 목록에 있는 이름으로 저장합니다.
        const { name, problem } = resolveSaveName(typed, names);
        if (problem) {
            toast.error(problem);
            return false;
        }
        if (overwritesOtherProject(typed, names, activeName)) {
            const answer = await confirm({
                title: `'${name}' 작업이 이미 있습니다.`,
                description: '덮어쓰면 그 작업의 예전 내용은 사라집니다.',
                confirmLabel: '덮어쓰기',
                danger: true,
            });
            if (!answer) return false;
        }
        const data = JSON.stringify({ students, groups, settings, movementHistory }, null, 2);
        try {
            const written = await storage.write(name, data);
            if (written === 'locked') {
                toast.error('다른 프로그램이 이 작업 파일을 쓰고 있어 저장하지 못했습니다. 그 프로그램을 닫고 다시 저장해 주세요.');
                return false;
            }
            if (!written) throw new Error('write failed');
        } catch (e) {
            console.error(e);
            toast.error('저장하지 못했습니다.');
            return false;
        }
        toast.success(`'${name}' 작업을 저장했습니다.`);
        setActiveName(name);
        void refresh();
        return true;
    };

    const apply = (content: string): boolean => {
        const parsed = parseProjectFile(content);
        if (!parsed) return false;
        loadProject(parsed.data);
        setNotices(parsed.notices);
        onLoaded();
        return true;
    };

    const load = async (name: string) => {
        if (students.length > 0 && !(await confirm(DISCARD_WARNING))) return;
        try {
            const content = await storage.read(name);
            if (!content) {
                toast.error('작업을 찾을 수 없습니다.');
                return;
            }
            if (apply(content)) {
                toast.success(`'${name}' 작업을 불러왔습니다.`);
                setActiveName(name);
            } else {
                toast.error('올바르지 않은 작업 파일입니다.');
            }
        } catch (e) {
            console.error(e);
            toast.error('작업을 읽지 못했습니다.');
        }
    };

    const remove = async (name: string) => {
        const answer = await confirm({
            title: `'${name}' 작업을 지울까요?`,
            description: '지운 작업은 되돌릴 수 없습니다.',
            confirmLabel: '삭제',
            danger: true,
        });
        if (!answer) return;
        try {
            if (!(await storage.remove(name))) throw new Error('remove failed');
        } catch (e) {
            console.error(e);
            toast.error('지우지 못했습니다.');
            return;
        }
        toast.success('작업을 지웠습니다.');
        if (activeName === name) setActiveName(null);
        void refresh();
    };

    /** 브라우저에서 저장 파일을 직접 여는 길입니다. 앱에는 없습니다. */
    const openFile = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            if (students.length > 0 && !(await confirm(DISCARD_WARNING))) return;
            try {
                if (apply(await file.text())) {
                    setActiveName(null);
                    toast.success('작업을 불러왔습니다.');
                } else toast.error('올바르지 않은 작업 파일입니다.');
            } catch (e) {
                console.error(e);
                toast.error('파일을 읽지 못했습니다.');
            }
        };
        input.click();
    };

    return { names, activeName, save, load, remove, openFile };
}
