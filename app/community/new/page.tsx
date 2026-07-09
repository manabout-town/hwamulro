import Link from "next/link"
import { PostForm } from "@/components/community/PostForm"

interface SearchParams { category?: string }

export default function NewPostPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/community"
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg transition-colors"
        >
          ←
        </Link>
        <h1 className="text-lg font-bold text-gray-900">글쓰기</h1>
      </div>
      <PostForm initialCategory={searchParams.category} />
    </div>
  )
}
