'use client';

import { useEffect, useRef, useState } from 'react';
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
  const leaveStep2 = useRef<(() => Promise<boolean>) | null>(null);
  const updates = useUpdates();

  useEffect(() => {
    setMounted(true);
  }, []);

  // 12칸 보드를 보는 동안만 접습니다. 다른 단계로 가면 보드가 사라지므로 단계도 함께 봅니다.
  const showsBoard = boardActive && activeTab === 'step3';
  useEffect(() => {
    setIsCollapsed(showsBoard);
  }, [showsBoard]);

  // 2단계의 저장하지 않은 변경은 단계를 떠나면 사라지므로 어느 길로 떠나든 묻습니다.
  const changeStep = async (next: string) => {
    if (activeTab === 'step2' && next !== 'step2' && leaveStep2.current && !(await leaveStep2.current())) return;
    setActiveTab(next);
  };

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
        onValueChange={changeStep}
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
              onBack={() => changeStep('step1')}
              onNext={() => changeStep('step3')}
              leaveGuard={leaveStep2}
            />
          </TabsContent>

          {/* 3단계는 도구 줄을 위에 붙이고 보드 높이를 창에 맞추므로 여백을 스스로 둡니다. */}
          <TabsContent value="step3">
            <Step3Dashboard onBack={() => setActiveTab('step2')} onBoardActiveChange={setBoardActive} />
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
