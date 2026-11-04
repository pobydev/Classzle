'use client';

// 자주 쓰지 않거나 위험한 동작을 모아 두는 ⋯ 메뉴입니다. 위험한 동작은 확인 창을 그대로 거칩니다.

import type { ReactNode } from 'react';
import { DotsThree } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function MoreMenu({ label = '더 보기', children, size = 'icon-sm' }: {
    label?: string;
    children: ReactNode;
    size?: 'icon-sm' | 'icon';
}) {
    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size={size} aria-label={label} title={label} className="data-[state=open]:bg-surface-hover data-[state=open]:text-ink">
                    <DotsThree size={20} weight="bold" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>{children}</DropdownMenuContent>
        </DropdownMenu>
    );
}

export {
    DropdownMenuItem as MoreMenuItem,
    DropdownMenuLabel as MoreMenuLabel,
    DropdownMenuSeparator as MoreMenuSeparator,
} from '@/components/ui/dropdown-menu';
