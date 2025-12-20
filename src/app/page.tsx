'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Step1Setup from '@/components/step1/Step1Setup';
import Step2Constraints from '@/components/step2/Step2Constraints';
import Step3Dashboard from '@/components/step3/Step3Dashboard';

import { Button } from '@/components/ui/button';
import { useClasszleStore } from '@/lib/store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FolderOpen, FloppyDisk, Trash, BookOpen, Question } from "@phosphor-icons/react";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('step1');
  const { students, groups, settings, loadProject } = useClasszleStore();

  // Named Save/Load States
  const [projectList, setProjectList] = useState<string[]>([]);
  const [activeProjectName, setActiveProjectName] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');

  useEffect(() => {
    setMounted(true);
    refreshProjectList();
  }, []);

  const refreshProjectList = async () => {
    if (window.electronAPI) {
      const list = await window.electronAPI.getProjectList();
      setProjectList(list);
    } else {
      // 브라우저 환경 (localStorage)
      try {
        const storedList = localStorage.getItem('classzle_project_list');
        if (storedList) {
          setProjectList(JSON.parse(storedList));
        } else {
          setProjectList([]);
        }
      } catch (e) {
        console.error('Failed to get project list from localStorage:', e);
        setProjectList([]);
      }
    }
  };

  const handleSaveClick = () => {
    setSaveDialogOpen(true);
  };

  const handleNamedSave = async () => {
    if (!projectName.trim()) {
      toast.error('프로젝트 이름을 입력해주세요.');
      return;
    }

    const dataObj = { students, groups, settings };
    const dataStr = JSON.stringify(dataObj, null, 2);

    if (window.electronAPI) {
      const success = await window.electronAPI.saveNamedProject(projectName, dataStr);
      if (success) {
        toast.success(`'${projectName}' 프로젝트가 저장되었습니다.`);
        setSaveDialogOpen(false);
        setActiveProjectName(projectName);
        setProjectName('');
        refreshProjectList();
      } else {
        toast.error('저장 중 오류가 발생했습니다.');
      }
    } else {
      // 브라우저 환경 (localStorage)
      try {
        localStorage.setItem(`classzle_project_data_${projectName}`, dataStr);

        const storedList = localStorage.getItem('classzle_project_list');
        let list = storedList ? JSON.parse(storedList) : [];
        if (!list.includes(projectName)) {
          list.push(projectName);
          localStorage.setItem('classzle_project_list', JSON.stringify(list));
        }

        toast.success(`'${projectName}' 프로젝트가 저장되었습니다.`);
        setSaveDialogOpen(false);
        setActiveProjectName(projectName);
        setProjectName('');
        refreshProjectList();
      } catch (e) {
        process.env.NODE_ENV === 'development' && console.error(e);
        toast.error('저장 중 오류가 발생했습니다. (공간 부족 등)');
      }
    }
  };

  const handleNamedLoad = async (name: string) => {
    if (students.length > 0) {
      if (!confirm('현재 작업 중인 내용이 있습니다. 저장하지 않은 내용은 사라집니다. 계속하시겠습니까?')) {
        return;
      }
    }

    let dataStr: string | null = null;

    if (window.electronAPI) {
      dataStr = await window.electronAPI.loadNamedProject(name);
    } else {
      // 브라우저 환경
      dataStr = localStorage.getItem(`classzle_project_data_${name}`);
    }

    if (dataStr) {
      try {
        const data = JSON.parse(dataStr);
        if (data.students && data.settings) {
          loadProject(data);
          toast.success(`'${name}' 프로젝트를 불러왔습니다.`);
          setActiveProjectName(name);
          setActiveTab('step1');
        } else {
          toast.error('올바르지 않은 프로젝트 데이터입니다.');
        }
      } catch (e) {
        console.error(e);
        toast.error('프로젝트를 읽는 중 오류가 발생했습니다.');
      }
    } else {
      toast.error('프로젝트 데이터를 찾을 수 없습니다.');
    }
  };

  const handleDeleteProject = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`'${name}' 프로젝트를 삭제하시겠습니까?`)) return;

    if (window.electronAPI) {
      const success = await window.electronAPI.deleteProject(name);
      if (success) {
        toast.success('프로젝트가 삭제되었습니다.');
        if (activeProjectName === name) setActiveProjectName(null);
        refreshProjectList();
      } else {
        toast.error('삭제 중 오류가 발생했습니다.');
      }
    } else {
      // 브라우저 환경
      try {
        localStorage.removeItem(`classzle_project_data_${name}`);
        const storedList = localStorage.getItem('classzle_project_list');
        if (storedList) {
          let list = JSON.parse(storedList);
          list = list.filter((n: string) => n !== name);
          localStorage.setItem('classzle_project_list', JSON.stringify(list));
        }
        toast.success('프로젝트가 삭제되었습니다.');
        if (activeProjectName === name) setActiveProjectName(null);
        refreshProjectList();
      } catch (e) {
        console.error(e);
        toast.error('삭제 중 오류가 발생했습니다.');
      }
    }
  };

  const handleBrowserLoad = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (students.length > 0) {
        if (!confirm('현재 작업 중인 내용이 있습니다. 저장하지 않은 내용은 사라집니다. 계속하시겠습니까?')) {
          return;
        }
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        try {
          const data = JSON.parse(content);
          if (data.students && data.settings) {
            loadProject(data);
            toast.success('작업 내용을 불러왔습니다.');
            setActiveTab('step1');
          } else {
            toast.error('올바르지 않은 프로젝트 파일입니다.');
          }
        } catch (error) {
          console.error(error);
          toast.error('파일을 읽는 중 오류가 발생했습니다.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
        {/* 헤더 */}
        <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm shadow-indigo-500/5">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-6">
            {/* Logo Section */}
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
              onClick={() => window.location.reload()}
              title="새로고침"
            >
              <div className="w-10 h-10 flex items-center justify-center">
                <img src="/logo.jpg" alt="Classzle Logo" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col -gap-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 flex items-center gap-2">
                    Classzle
                  </h1>

                </div>
                <p className="text-[10px] font-medium text-slate-400 leading-tight hidden sm:block">
                  완벽한 반 편성을 위한 마지막 조각
                </p>
              </div>
            </div>

            {/* Navigation Tabs Section */}
            <div className="flex-1 max-w-xl">
              <TabsList className="grid w-full grid-cols-3 h-10 bg-slate-100/50 p-1 rounded-xl">
                <TabsTrigger value="step1" className="flex items-center gap-2 text-sm py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600">
                  <span className="text-base">1️⃣</span>
                  <span className="hidden md:inline font-medium">기초 정보</span>
                </TabsTrigger>
                <TabsTrigger value="step2" className="flex items-center gap-2 text-sm py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600">
                  <span className="text-base">2️⃣</span>
                  <span className="hidden md:inline font-medium">조건 설정</span>
                </TabsTrigger>
                <TabsTrigger value="step3" className="flex items-center gap-2 text-sm py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600">
                  <span className="text-base">3️⃣</span>
                  <span className="hidden md:inline font-medium">반 편성</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Action Buttons Section */}
            <div className="flex gap-2 flex-shrink-0 items-center">
              {mounted && (
                <>
                  <div className="flex items-center bg-slate-100/50 rounded-xl border border-slate-200 p-0.5">
                    <Select value={activeProjectName || ""} onValueChange={handleNamedLoad}>
                      <SelectTrigger className="w-[140px] h-8 border-none bg-transparent focus:ring-0 text-xs font-medium">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <FolderOpen size={16} className="text-slate-500 shrink-0" />
                          <SelectValue placeholder="저장된 작업" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {projectList.length === 0 ? (
                          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                            저장된 내역이 없습니다.
                          </div>
                        ) : (
                          projectList.map((name) => (
                            <SelectItem key={name} value={name} className="group">
                              <div className="flex items-center justify-between w-full min-w-[120px]">
                                <span>{name}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity ml-2 hover:bg-red-50 hover:text-red-500"
                                  onClick={(e) => handleDeleteProject(name, e)}
                                >
                                  <Trash size={12} />
                                </Button>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <div className="w-[1px] h-4 bg-slate-200 mx-0.5" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSaveClick}
                      className="h-8 px-2 hover:bg-white hover:text-indigo-600 rounded-lg text-xs font-medium gap-1.5"
                    >
                      <FloppyDisk size={16} />
                      <span>저장</span>
                    </Button>
                  </div>


                </>
              )}
            </div>
          </div>
        </header>

        {/* 저장 대화상자 */}
        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>작업 내용 저장</DialogTitle>
              <DialogDescription>
                현재 프로젝트의 이름을 지정하여 저장합니다. 언제든지 다시 불러올 수 있습니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="name" className="text-right text-sm font-medium">
                  이름
                </label>
                <Input
                  id="name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="예: 2025학년도 1차"
                  className="col-span-3"
                  onKeyDown={(e) => e.key === 'Enter' && handleNamedSave()}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>취소</Button>
              <Button onClick={handleNamedSave}>저장하기</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 메인 콘텐츠 */}
        <div className="container mx-auto px-4 py-6 flex-1">
          <TabsContent value="step1" className="mt-0 outline-none">
            <Step1Setup onNext={() => setActiveTab('step2')} />
          </TabsContent>

          <TabsContent value="step2" className="mt-0 outline-none">
            <Step2Constraints
              onBack={() => setActiveTab('step1')}
              onNext={() => setActiveTab('step3')}
            />
          </TabsContent>

          <TabsContent value="step3" className="mt-0 outline-none">
            <Step3Dashboard onBack={() => setActiveTab('step2')} />
          </TabsContent>
        </div>
      </Tabs>

      {/* 푸터 */}
      <footer className="border-t mt-auto py-4">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2025 Classzle. All rights reserved.
        </div>
      </footer>

      {/* Floating User Guide Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          className="rounded-full w-12 h-12 shadow-lg hover:scale-110 transition-transform bg-indigo-600 hover:bg-indigo-700 text-white p-0"
          onClick={() => window.open('https://classzle-guide.vercel.app/', '_blank')}
          title="사용자 가이드 (웹사이트)"
        >
          <Question size={24} weight="bold" />
        </Button>
      </div>
    </main>
  );
}
