import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// 공통 글자 크기, 모서리, 그림자 이름을 알려 줍니다. 모르면 text-micro를 글자 색으로 보고
// 같이 쓴 text-ink를 지웁니다.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "caption", "small", "body", "emph", "title-sm", "title", "display"],
      radius: ["input", "button", "card", "window"],
      shadow: ["card", "lift", "float"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
