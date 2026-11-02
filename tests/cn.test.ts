import { describe, expect, it } from "vitest"
import { cn } from "../src/lib/utils"

describe("cn과 공통 이름", () => {
  it("글자 크기와 글자 색을 함께 남긴다", () => {
    expect(cn("text-ink", "text-micro")).toBe("text-ink text-micro")
    expect(cn("text-title-sm", "text-accent-ink")).toBe("text-title-sm text-accent-ink")
  })

  it("같은 종류는 뒤의 것으로 바꾼다", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption")
    expect(cn("rounded-card", "rounded-input")).toBe("rounded-input")
    expect(cn("shadow-card", "shadow-lift")).toBe("shadow-lift")
    expect(cn("bg-accent", "bg-wash")).toBe("bg-wash")
  })
})
