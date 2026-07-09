-- ============================================================
-- 016: 커뮤니티 (게시판/댓글/좋아요/신고) + 광고 배너
-- ============================================================

-- 1. 커뮤니티 게시글
--    카테고리: buy(삽니다) / sell(팝니다) / photo(운행사진) / info(정보공유)
CREATE TABLE IF NOT EXISTS community_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK (category IN ('buy', 'sell', 'photo', 'info')),
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  content       TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  images        JSONB NOT NULL DEFAULT '[]',
  price         INTEGER CHECK (price IS NULL OR price >= 0),
  like_count    INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  is_hidden     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_category ON community_posts(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_author ON community_posts(author_id);

-- 2. 댓글
CREATE TABLE IF NOT EXISTS community_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  is_hidden  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id, created_at);

-- 3. 좋아요 (게시글당 1인 1회)
CREATE TABLE IF NOT EXISTS community_likes (
  post_id    UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- 4. 신고 (게시글/댓글)
CREATE TABLE IF NOT EXISTS community_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id   UUID NOT NULL,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'actioned', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (target_type, target_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_community_reports_status ON community_reports(status, created_at DESC);

-- 5. 좋아요/댓글 수 카운터 트리거
CREATE OR REPLACE FUNCTION community_like_counter() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_community_like_counter ON community_likes;
CREATE TRIGGER trg_community_like_counter
  AFTER INSERT OR DELETE ON community_likes
  FOR EACH ROW EXECUTE FUNCTION community_like_counter();

CREATE OR REPLACE FUNCTION community_comment_counter() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_community_comment_counter ON community_comments;
CREATE TRIGGER trg_community_comment_counter
  AFTER INSERT OR DELETE ON community_comments
  FOR EACH ROW EXECUTE FUNCTION community_comment_counter();

-- 6. RLS
ALTER TABLE community_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reports  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_posts_select" ON community_posts;
DROP POLICY IF EXISTS "community_posts_insert" ON community_posts;
DROP POLICY IF EXISTS "community_posts_update_own" ON community_posts;
DROP POLICY IF EXISTS "community_posts_delete_own" ON community_posts;
DROP POLICY IF EXISTS "community_comments_select" ON community_comments;
DROP POLICY IF EXISTS "community_comments_insert" ON community_comments;
DROP POLICY IF EXISTS "community_comments_delete_own" ON community_comments;
DROP POLICY IF EXISTS "community_likes_select" ON community_likes;
DROP POLICY IF EXISTS "community_likes_insert" ON community_likes;
DROP POLICY IF EXISTS "community_likes_delete" ON community_likes;
DROP POLICY IF EXISTS "community_reports_insert" ON community_reports;
DROP POLICY IF EXISTS "community_reports_select_own" ON community_reports;

CREATE POLICY "community_posts_select" ON community_posts
  FOR SELECT TO authenticated
  USING (NOT is_hidden OR author_id = auth.uid());

CREATE POLICY "community_posts_insert" ON community_posts
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "community_posts_update_own" ON community_posts
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "community_posts_delete_own" ON community_posts
  FOR DELETE TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "community_comments_select" ON community_comments
  FOR SELECT TO authenticated
  USING (NOT is_hidden OR author_id = auth.uid());

CREATE POLICY "community_comments_insert" ON community_comments
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "community_comments_delete_own" ON community_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "community_likes_select" ON community_likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "community_likes_insert" ON community_likes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_likes_delete" ON community_likes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "community_reports_insert" ON community_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "community_reports_select_own" ON community_reports
  FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid() OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- 7. 광고 배너 (제휴/광고 수익)
--    placement: driver_feed / order_board / community / shipper_dashboard / driver_dashboard
CREATE TABLE IF NOT EXISTS ad_banners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  advertiser_name TEXT NOT NULL,
  contact         TEXT,
  image_url       TEXT NOT NULL,
  link_url        TEXT,
  placement       TEXT NOT NULL CHECK (placement IN (
    'driver_feed', 'order_board', 'community', 'shipper_dashboard', 'driver_dashboard'
  )),
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_banners_placement ON ad_banners(placement, is_active, sort_order);

ALTER TABLE ad_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_banners_select_active" ON ad_banners;
CREATE POLICY "ad_banners_select_active" ON ad_banners
  FOR SELECT TO authenticated
  USING (
    (is_active AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW()))
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- 8. 스토리지 버킷
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-images', 'community-images', true, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ad-banners', 'ad-banners', true, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "community_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "community_images_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "ad_banners_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "ad_banners_admin_delete" ON storage.objects;

CREATE POLICY "community_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-images');

CREATE POLICY "community_images_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'community-images' AND owner = auth.uid());

CREATE POLICY "ad_banners_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ad-banners' AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "ad_banners_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ad-banners' AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
