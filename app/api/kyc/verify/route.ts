import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 60

// ─── Upload validation (POL-022 / BUG-008) ───────────────────────────────────
// Claude Vision이 지원하고 신분/사업자 서류에 적합한 이미지 타입만 허용
const ALLOWED_UPLOAD_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10MB

// 위반 시 사용자용 에러 메시지 반환, 정상이면 null
function validateUploadFile(file: File, label: string): string | null {
  if (file.size === 0) return `${label} 파일이 비어 있습니다.`
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${label} 파일이 너무 큽니다. 10MB 이하 이미지로 업로드해주세요.`
  }
  if (!ALLOWED_UPLOAD_MIME.has(file.type)) {
    return `${label}은(는) JPG·PNG·WEBP 이미지 파일만 업로드할 수 있습니다.`
  }
  return null
}

// ─── Type definitions ────────────────────────────────────────────────────────

interface ClaudeDocResult {
  is_authentic: boolean
  confidence: number
  doc_type_match: boolean
  extracted_number: string | null
  issues: string[]
  quality_ok: boolean
}

interface ClovaOCRResult {
  skipped?: boolean
  error?: string
  images?: unknown[]
}

interface GovApiResult {
  skipped?: boolean
  error?: string
  valid?: boolean
  status_code?: string
  reason?: string
  raw?: unknown
}

// ─── Claude Vision analysis ───────────────────────────────────────────────────

async function analyzeDocument(
  client: Anthropic,
  buffer: Buffer,
  mimeType: string,
  docType: 'business_registration' | 'driver_license'
): Promise<ClaudeDocResult> {
  const docLabel =
    docType === 'business_registration' ? '사업자등록증' : '운전면허증'

  const prompt = `당신은 한국 공식 문서 진위 여부를 검증하는 전문가입니다.
첨부된 이미지가 유효한 한국 공식 ${docLabel}인지 분석해 주세요.

다음 항목을 꼼꼼히 확인하세요:
1. 문서 형식이 공식 ${docLabel} 레이아웃과 일치하는지
2. 텍스트가 명확하고 일관성이 있는지
3. 공식 직인/도장이 존재하는지
4. 디지털 조작 흔적(픽셀 이상, 폰트 불일치, 배경 불연속성 등)이 없는지
5. 이미지 품질이 내용을 판독하기에 충분한지

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "is_authentic": true,
  "confidence": 0.92,
  "doc_type_match": true,
  "extracted_number": "123-45-67890",
  "issues": [],
  "quality_ok": true
}`

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as
                  | 'image/jpeg'
                  | 'image/png'
                  | 'image/gif'
                  | 'image/webp',
                data: buffer.toString('base64'),
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    // Extract text from response (skip thinking blocks)
    let responseText = ''
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text
      }
    }

    const match = responseText.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error('JSON not found in response')
    }

    const parsed = JSON.parse(match[0]) as ClaudeDocResult
    return parsed
  } catch (err) {
    console.error(`[KYC] Claude Vision analysis failed for ${docType}:`, err)
    return {
      is_authentic: false,
      confidence: 0.3,
      doc_type_match: false,
      extracted_number: null,
      issues: ['분석 실패'],
      quality_ok: false,
    }
  }
}

// ─── Clova OCR ────────────────────────────────────────────────────────────────

async function runClovaOCR(
  buffer: Buffer,
  mimeType: string
): Promise<ClovaOCRResult> {
  const apigwUrl = process.env.NAVER_CLOVA_APIGW_URL
  const secretKey = process.env.NAVER_CLOVA_SECRET_KEY

  if (!apigwUrl || !secretKey) {
    return { skipped: true }
  }

  try {
    const format = mimeType.split('/')[1] ?? 'jpeg'
    const base64Data = buffer.toString('base64')

    const body = {
      images: [{ format, name: 'doc', data: base64Data }],
      requestId: crypto.randomUUID(),
      version: 'V2',
      timestamp: Date.now(),
    }

    const res = await fetch(apigwUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OCR-SECRET': secretKey,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      return { skipped: false, error: `HTTP ${res.status}` }
    }

    const data = (await res.json()) as { images?: unknown[] }
    return { images: data.images ?? [] }
  } catch (err) {
    console.error('[KYC] Clova OCR failed:', err)
    return { skipped: false, error: String(err) }
  }
}

// ─── 국세청 Business Number Validation ───────────────────────────────────────

async function validateBusinessNumber(bizNumber: string): Promise<GovApiResult> {
  const cleaned = bizNumber.replace(/\D/g, '')

  if (cleaned.length !== 10) {
    return { valid: false, reason: 'invalid_format' }
  }

  const apiKey = process.env.NTS_API_KEY
  if (!apiKey) {
    return { skipped: true }
  }

  try {
    const encodedKey = encodeURIComponent(apiKey)
    const url = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodedKey}&returnType=JSON`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ b_no: [cleaned] }),
    })

    if (!res.ok) {
      return { valid: false, error: `HTTP ${res.status}` }
    }

    const data = (await res.json()) as { data?: Array<{ b_stt_cd?: string }> }
    const record = data.data?.[0]
    const statusCode = record?.b_stt_cd ?? ''
    const isValid = statusCode === '01'

    return { valid: isValid, status_code: statusCode, raw: data }
  } catch (err) {
    console.error('[KYC] NTS business number validation failed:', err)
    return { valid: false, error: String(err) }
  }
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

function computeConfidence(
  biz: ClaudeDocResult,
  lic: ClaudeDocResult | null,
  gov: GovApiResult | null,
  role: string
): number {
  let score = biz.confidence

  if (!biz.is_authentic) {
    score -= 0.35
  }

  if (role === 'driver' && lic !== null) {
    score = (score + lic.confidence) / 2
    if (!lic.is_authentic) {
      score -= 0.25
    }
  }

  if (gov !== null && !gov.skipped) {
    if (gov.valid === true) {
      score = Math.min(1.0, score + 0.15)
    } else if (gov.valid === false) {
      score -= 0.35
    }
  }

  return Math.max(0, Math.min(1, score))
}

// ─── Rejection reason builder ─────────────────────────────────────────────────

function buildRejectionReason(
  biz: ClaudeDocResult,
  lic: ClaudeDocResult | null,
  gov: GovApiResult | null
): string {
  const parts: string[] = []

  if (biz.issues.length > 0) {
    parts.push(...biz.issues)
  }

  if (lic && lic.issues.length > 0) {
    parts.push(...lic.issues)
  }

  if (gov && !gov.skipped && gov.valid === false) {
    parts.push('사업자등록번호 국세청 조회 실패')
  }

  const joined = parts.join('. ')
  return joined.length > 200 ? joined.slice(0, 197) + '...' : joined
}

// ─── File upload helper ───────────────────────────────────────────────────────

async function uploadToStorage(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  docType: string,
  buffer: Buffer,
  contentType: string,
  ext: string
): Promise<string> {
  const timestamp = Date.now()
  const path = `kyc/${userId}/${docType}_${timestamp}.${ext}`

  // Ensure bucket exists (ignore error if already exists)
  try {
    await service.storage.createBucket('kyc-documents', { public: false })
  } catch {
    // Bucket already exists — continue
  }

  const { error } = await service.storage
    .from('kyc-documents')
    .upload(path, buffer, { contentType, upsert: true })

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`)
  }

  const {
    data: { publicUrl },
  } = service.storage.from('kyc-documents').getPublicUrl(path)

  return publicUrl
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      )
    }

    // 2. Get user profile
    const service = createServiceClient()
    const { data: profile, error: profileError } = await service
      .from('users')
      .select('role, verification_status')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: '사용자 정보를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 3. Already verified short-circuit
    if (profile.verification_status === 'verified') {
      return NextResponse.json({
        status: 'approved',
        message: '이미 인증된 계정입니다.',
      })
    }

    // 3.5. BUG-009 / POL-052: 재제출 남용 방지 (24h 횟수 제한 + 반복 실패 시 자동승인 차단)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentSubs } = await service
      .from('kyc_submissions')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', since24h)
    const RESUBMIT_LIMIT = 3
    const priorAttempts = recentSubs?.length ?? 0
    if (priorAttempts >= RESUBMIT_LIMIT) {
      return NextResponse.json(
        { error: '재제출 한도를 초과했습니다. 24시간 후 다시 시도하거나 고객센터로 문의해주세요.' },
        { status: 429 }
      )
    }

    // 4. Parse form data
    const formData = await req.formData()
    const bizFile = formData.get('business_registration') as File | null
    const licFile = formData.get('driver_license') as File | null

    // 5. Driver requires both files; shipper biz file is optional
    if (profile.role === 'driver' && !bizFile) {
      return NextResponse.json(
        { error: '운전기사 역할은 사업자등록증 파일이 필요합니다.' },
        { status: 400 }
      )
    }

    if (profile.role === 'driver' && !licFile) {
      return NextResponse.json(
        { error: '운전기사 역할은 운전면허증 파일이 필요합니다.' },
        { status: 400 }
      )
    }

    // Shipper with no business registration → auto-approve
    if (!bizFile) {
      await service
        .from('users')
        .update({ verification_status: 'verified' })
        .eq('id', user.id)
      return NextResponse.json({
        status: 'approved',
        message: '인증이 완료되었습니다.',
        reason: '인증이 완료되었습니다.',
        confidence: 1.0,
      })
    }

    // 5.5. POL-022 / BUG-008: 파일 타입·용량 서버검증 (버퍼링·업로드·Vision 전송 이전)
    const bizErr = validateUploadFile(bizFile, '사업자등록증')
    if (bizErr) return NextResponse.json({ error: bizErr }, { status: 400 })
    if (licFile) {
      const licErr = validateUploadFile(licFile, '운전면허증')
      if (licErr) return NextResponse.json({ error: licErr }, { status: 400 })
    }

    // 6. Upload files to Supabase Storage
    const bizBuffer = Buffer.from(await bizFile.arrayBuffer())
    const bizExt = (bizFile.name.split('.').pop() ?? 'jpg').toLowerCase()
    const bizContentType = bizFile.type || `image/${bizExt}`

    const bizUrl = await uploadToStorage(
      service,
      user.id,
      'business_registration',
      bizBuffer,
      bizContentType,
      bizExt
    )

    let licBuffer: Buffer | null = null
    let licUrl: string | null = null

    if (licFile) {
      licBuffer = Buffer.from(await licFile.arrayBuffer())
      const licExt = (licFile.name.split('.').pop() ?? 'jpg').toLowerCase()
      const licContentType = licFile.type || `image/${licExt}`

      licUrl = await uploadToStorage(
        service,
        user.id,
        'driver_license',
        licBuffer,
        licContentType,
        licExt
      )
    }

    // 7. Run Claude Vision analysis
    const anthropic = new Anthropic()

    let bizResult: ClaudeDocResult
    let licResult: ClaudeDocResult | null = null
    let claudeFailed = false

    try {
      bizResult = await analyzeDocument(
        anthropic,
        bizBuffer,
        bizContentType,
        'business_registration'
      )

      if (licBuffer && licFile) {
        const licContentType = licFile.type || 'image/jpeg'
        licResult = await analyzeDocument(
          anthropic,
          licBuffer,
          licContentType,
          'driver_license'
        )
      }
    } catch (err) {
      console.error('[KYC] Claude Vision entirely failed:', err)
      claudeFailed = true
      bizResult = {
        is_authentic: false,
        confidence: 0.5,
        doc_type_match: false,
        extracted_number: null,
        issues: ['Vision 분석 실패'],
        quality_ok: false,
      }
    }

    // 8. Clova OCR (optional)
    const ocrResult: ClovaOCRResult = await runClovaOCR(
      bizBuffer,
      bizContentType
    )

    // 9. Business number validation via 국세청 (optional)
    let govResult: GovApiResult | null = null
    if (bizResult.extracted_number) {
      govResult = await validateBusinessNumber(bizResult.extracted_number)
    } else {
      govResult = { skipped: true }
    }

    // 10. Compute confidence
    let confidence: number
    if (claudeFailed) {
      confidence = 0.5
    } else {
      confidence = computeConfidence(bizResult, licResult, govResult, profile.role)
    }

    // 11. Determine status
    let submissionStatus: 'approved' | 'rejected' | 'manual_review'
    // POL-052: 반복 시도(누적 2회+)는 자동승인 차단 → 수동검토 강제 (임계값 gaming 방지)
    if (confidence >= 0.72 && priorAttempts < 2) {
      submissionStatus = 'approved'
    } else if (confidence < 0.35) {
      submissionStatus = 'rejected'
    } else {
      submissionStatus = 'manual_review'
    }

    const rejectionReason =
      submissionStatus === 'rejected' || submissionStatus === 'manual_review'
        ? buildRejectionReason(bizResult, licResult, govResult)
        : null

    // 12. Insert into kyc_submissions
    const { error: insertError } = await service.from('kyc_submissions').insert({
      user_id: user.id,
      role: profile.role,
      business_registration_url: bizUrl,
      driver_license_url: licUrl,
      ocr_result: ocrResult as Record<string, unknown>,
      government_api_result: govResult as Record<string, unknown>,
      claude_vision_result: {
        biz: bizResult,
        license: licResult,
      } as Record<string, unknown>,
      confidence_score: confidence,
      status: submissionStatus,
      rejection_reason: rejectionReason,
    })

    if (insertError) {
      console.error('[KYC] kyc_submissions insert failed:', insertError)
      return NextResponse.json(
        { error: 'KYC 제출 저장에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 13. Update users.verification_status
    const newVerificationStatus =
      submissionStatus === 'approved'
        ? 'verified'
        : submissionStatus === 'rejected'
          ? 'rejected'
          : 'pending'

    const { error: updateError } = await service
      .from('users')
      .update({ verification_status: newVerificationStatus })
      .eq('id', user.id)

    if (updateError) {
      console.error('[KYC] users.verification_status update failed:', updateError)
      // Non-fatal — submission was saved; status will be corrected on next admin review
    }

    // 14. Return result
    const messages: Record<string, string> = {
      approved: '인증이 완료되었습니다.',
      rejected: '서류 검증에 실패했습니다. 다시 제출해 주세요.',
      manual_review: '서류가 접수되었습니다. 담당자 검토 후 결과를 안내드립니다.',
    }

    return NextResponse.json({
      status: submissionStatus,
      message: messages[submissionStatus],
      reason: rejectionReason ?? messages[submissionStatus],
      confidence: Math.round(confidence * 100) / 100,
    })
  } catch (err) {
    console.error('[KYC] Unhandled error in /api/kyc/verify:', err)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }
}
