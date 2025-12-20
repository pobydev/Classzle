import { contextBridge, ipcRenderer } from 'electron';

// 보안을 위해 필요한 API만 노출
contextBridge.exposeInMainWorld('electronAPI', {
    // 필요한 경우 여기에 IPC 핸들러 추가
    platform: process.platform,
    versions: {
        node: process.versions.node,
        chrome: process.versions.chrome,
        electron: process.versions.electron,
    },
    saveProject: (data: string) => ipcRenderer.invoke('save-project', data),
    loadProject: () => ipcRenderer.invoke('load-project'),
    saveNamedProject: (name: string, data: string) => ipcRenderer.invoke('save-named-project', name, data),
    loadNamedProject: (name: string) => ipcRenderer.invoke('load-named-project', name),
    getProjectList: () => ipcRenderer.invoke('get-project-list'),
    deleteProject: (name: string) => ipcRenderer.invoke('delete-project', name),
    printPreview: (html: string) => ipcRenderer.invoke('print-preview', html),
});
