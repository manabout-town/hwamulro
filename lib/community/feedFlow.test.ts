import { describe, it, expect } from "vitest"
import { resolveCommunityFeed, type FeedDeps } from "./feedFlow"

function deps(overrides: Partial<FeedDeps> = {}): FeedDeps {
  return {
    fetchList: async () => [
      {
        id: "p1", category: "info", title: "제목", content: "내용",
        images: [], price: null, like_count: 0, comment_count: 0,
        created_at: "2026-01-01T00:00:00Z", author: { name: "홍길동", role: "driver" },
      },
    ],
    fetchPost: async () => ({
      id: "p1", category: "info", title: "제목", content: "내용",
      images: [], price: null, like_count: 0, comment_count: 1,
      created_at: "2026-01-01T00:00:00Z", author_id: "u1", is_hidden: false,
      author: { name: "홍길동", role: "driver" },
    }),
    fetchComments: async () => [
      {
        id: "c1", content: "댓글", created_at: "2026-01-01T00:10:00Z",
        author_id: "u2", author: { name: "김철수", role: "shipper" },
      },
    ],
    ...overrides,
  }
}

describe("resolveCommunityFeed", () => {
  it("postId 없으면 목록 모드로 게시글 목록을 반환한다", async () => {
    const r = await resolveCommunityFeed(deps(), {})
    expect(r.mode).toBe("list")
    if (r.mode === "list") {
      expect(r.posts).toHaveLength(1)
      expect(r.posts[0].id).toBe("p1")
    }
  })

  it("postId 있으면 단건+댓글 모드로 글과 댓글을 함께 반환한다", async () => {
    const r = await resolveCommunityFeed(deps(), { postId: "p1" })
    expect(r.mode).toBe("detail")
    if (r.mode === "detail") {
      expect(r.post.id).toBe("p1")
      expect(r.comments).toHaveLength(1)
      expect(r.comments[0].id).toBe("c1")
    }
  })

  it("작성자 정보에 phone/email 등이 섞여 있어도 name·role 두 필드만 남긴다", async () => {
    const dirty = deps({
      fetchList: async () => [
        {
          id: "p1", category: "info", title: "제목", content: "내용",
          images: [], price: null, like_count: 0, comment_count: 0,
          created_at: "2026-01-01T00:00:00Z",
          author: { name: "홍길동", role: "driver", phone: "01000000000", email: "a@b.com" } as any,
        },
      ],
    })
    const r = await resolveCommunityFeed(dirty, {})
    expect(r.mode).toBe("list")
    if (r.mode === "list") {
      expect(r.posts[0].author).toEqual({ name: "홍길동", role: "driver" })
      expect(Object.keys(r.posts[0].author as object)).not.toContain("phone")
      expect(Object.keys(r.posts[0].author as object)).not.toContain("email")
    }
  })

  it("단건 조회에서 댓글 작성자 정보도 name·role 두 필드만 남긴다", async () => {
    const dirty = deps({
      fetchComments: async () => [
        {
          id: "c1", content: "댓글", created_at: "2026-01-01T00:10:00Z",
          author_id: "u2", author: { name: "김철수", role: "shipper", phone: "01011112222" } as any,
        },
      ],
    })
    const r = await resolveCommunityFeed(dirty, { postId: "p1" })
    expect(r.mode).toBe("detail")
    if (r.mode === "detail") {
      expect(r.comments[0].author).toEqual({ name: "김철수", role: "shipper" })
    }
  })

  it("글이 없거나 숨김이면 not_found 모드를 반환한다", async () => {
    const r1 = await resolveCommunityFeed(deps({ fetchPost: async () => null }), { postId: "missing" })
    expect(r1.mode).toBe("not_found")

    const r2 = await resolveCommunityFeed(
      deps({ fetchPost: async () => ({
        id: "p2", category: "info", title: "t", content: "c",
        images: [], price: null, like_count: 0, comment_count: 0,
        created_at: "2026-01-01T00:00:00Z", author_id: "u1", is_hidden: true, author: null,
      }) }),
      { postId: "p2" }
    )
    expect(r2.mode).toBe("not_found")
  })
})
