'use client';

import { useEffect, useState } from 'react';
import { version } from '../../package.json';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import Step1Setup from '@/components/step1/Step1Setup';
import Step2Constraints from '@/components/step2/Step2Constraints';
import Step3Dashboard from '@/components/step3/Step3Dashboard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AppSidebar } from '@/components/shell/AppSidebar';
import { GuideDialog } from '@/components/shell/GuideDialog';
import { TitleBar } from '@/components/shell/TitleBar';
import { useSavedProjects } from '@/components/shell/useSavedProjects';
import { useUpdates } from '@/components/shell/useUpdates';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('step1');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [boardActive, setBoardActive] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const projects = useSavedProjects({ onLoaded: () => setActiveTab('step1') });
  const updates = useUpdates();

  useEffect(() => {
    setMounted(true);
  }, []);

  // 12칸 보드를 보는 동안만 접습니다. 다른 단계로 가면 보드가 사라지므로 단계도 함께 봅니다.
  const showsBoard = boardActive && activeTab === 'step3';
  useEffect(() => {
    setIsCollapsed(showsBoard);
  }, [showsBoard]);

  // onBoardActiveChange는 보드 담당 브랜치의 Step3Dashboard에 생깁니다. 합치기 전에도 타입 오류가 없도록 펼쳐서 넘깁니다.
  const boardProps = { onBoardActiveChange: setBoardActive };

  const saveProject = async () => {
    if (await projects.save(projectName)) {
      setSaveDialogOpen(false);
      setProjectName('');
    }
  };

  if (!mounted) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-emph text-soft">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-canvas">
      <TitleBar projectName={projects.activeName} />

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        orientation="vertical"
        className="flex-1 min-h-0 flex-row gap-0"
      >
        <AppSidebar
          isCollapsed={isCollapsed}
          onCollapsedChange={setIsCollapsed}
          projects={projects}
          updates={updates}
          onSave={() => setSaveDialogOpen(true)}
          onOpenGuide={() => setIsGuideOpen(true)}
        />

        <main className="flex-1 min-w-0 min-h-0 overflow-auto">
          <TabsContent value="step1" className="p-5">
            <Step1Setup onNext={() => setActiveTab('step2')} />
          </TabsContent>

          <TabsContent value="step2" className="p-5">
            <Step2Constraints
              onBack={() => setActiveTab('step1')}
              onNext={() => setActiveTab('step3')}
            />
          </TabsContent>

          <TabsContent value="step3" className="p-5">
            <Step3Dashboard onBack={() => setActiveTab('step2')} {...boardProps} />
          </TabsContent>
        </main>
      </Tabs>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>작업 저장</DialogTitle>
            <DialogDescription>
              이름을 정해 저장합니다. 왼쪽 목록에서 언제든 다시 불러올 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 py-2">
            <label htmlFor="project-name" className="flex-shrink-0 text-body font-medium">
              이름
            </label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="예: 2025학년도 1차"
              onKeyDown={(e) => e.key === 'Enter' && saveProject()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveDialogOpen(false)}>취소</Button>
            <Button onClick={saveProject}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GuideDialog
        isOpen={isGuideOpen}
        appVersion={version}
        updates={updates}
        onClose={() => setIsGuideOpen(false)}
      />
    </div>
  );
}
