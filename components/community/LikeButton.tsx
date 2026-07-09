"use client"
import { useState, useTransition } from "react"
import { toggleLike } from "@/app/actions/community"

interface Props {
  postId: string
  initialCount: number
  initialLiked: boolean
}

export function LikeButton({ postId, initialCount, initialLiked }: Props) {
  const [isPending, startTransition] = useTransition()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)

  function handleClick() {
    if (isPending) return
    // 낙관적 업데이트
    const nextLiked = !liked
    setLiked(nextLiked)
    setCount(c => (nextLiked ? c + 1 : Math.max(c - 1, 0)))
    startTransition(async () => {
      const result = await toggleLike(postId)
      if (result?.error) {
        // 롤백
        setLiked(liked)
        setCount(count)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border transition-all min-h-[40px] ${
        liked
          ? "bg-rose-50 border-rose-200 text-rose-600"
          : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
      }`}
    >
      <span className={liked ? "scale-110" : ""}>{liked ? "❤️" : "🤍"}</span>
      좋아요 {count}
    </button>
  )
}
