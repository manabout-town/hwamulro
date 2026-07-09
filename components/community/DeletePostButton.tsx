"use client"
import { useState, useTransition } from "react"
import { deletePost } from "@/app/actions/community"

export function DeletePostButton({ postId }: { postId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deletePost(postId)
      } catch (err: any) {
        if (err?.digest?.startsWith("NEXT_REDIRECT")) throw err
      }
    })
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-xs font-semibold text-red-600 hover:text-red-700"
        >
          {isPending ? "삭제 중..." : "정말 삭제"}
        </button>
        <button onClick={() => setConfirming(false)} className="text-xs text-gray-400">취소</button>
      </span>
    )
  }

  return (
    <button onClick={() => setConfirming(true)} className="text-xs text-gray-300 hover:text-red-400 transition-colors">
      삭제
    </button>
  )
}
