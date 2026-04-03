// src/domains/review/ui/ReviewCommentForm.tsx

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Button } from "@/shared/ui/Button";

/**
 * ReviewCommentForm.tsx (UI Layer - 리뷰 댓글 입력 폼 컴포넌트)
 *
 * 역할/목적:
 * - 사용자가 리뷰에 댓글을 입력하고 전송하는 UI 폼 제공
 * - 인증 여부에 따라 입력 가능/불가 상태를 분기하고, 미인증 시 로그인 CTA를 표시
 *
 * 공개 정책 / 설계 원칙:
 * - export: ReviewCommentForm (named export), ReviewCommentFormProps (type export)
 * - 입력 유효성(길이 제한, 공백 처리)은 이 컴포넌트에서 담당
 * - 인증/네트워크/에러 정책은 onSubmit·onRequestLogin 콜백으로 상위 컨테이너에 위임
 *
 * 동작 방식:
 * - 미인증: textarea 비활성화 + 로그인 안내 문구 + 로그인 버튼 표시
 * - 인증 중: Ctrl/⌘ + Enter 단축키 전송 지원 (IME 조합 중 Enter는 무시)
 * - 제출 중 중복 전송 방지: isSubmitting state + submitLockedRef(ref) 이중 잠금
 * - 성공 후 입력값 초기화, 실패 시 입력값 유지(재전송 가능 UX)
 *
 * 운영 포인트:
 * - REVIEW_COMMENT_BODY_MAX_LENGTH: 서버/DB 저장 한계 이내로 클라이언트에서 선행 제한
 * - 글자 수 카운터는 raw 입력 기준으로 표시하지만, 실제 제출 유효성은 trim 기준
 */

/**
 * 댓글 입력 최대 글자 수 정책 (클라이언트 UX 기준)
 *
 * 배경:
 * - 서버/DB 저장 가능 한계 범위 이내로 클라이언트에서 미리 제한
 * - 초과 입력 방지/검증/에러 메시지 처리를 이 상수 하나로 단일화
 *
 * 정책:
 * - 초과 입력 방지/검증/에러 메시지 처리를 여기서 단일화
 */
const REVIEW_COMMENT_BODY_MAX_LENGTH = 800

export type ReviewCommentFormProps = {
    /**
     * 댓글 제출 핸들러 (컨테이너/비즈니스 로직을 컴포넌트에서 분리)
     *
     * 정책:
     * - body는 사용자가 입력한 내용으로, 이 컴포넌트에서 trim 처리 후 전달
     * - 이 컴포넌트는 trim/empty/maxLength 등 1차 UX 검증만 처리
     * - 실패 후 입력값을 유지하는 것이 권장 UX이며, 에러는 호출 측에서 처리
     */
    onSubmit: (body: string) => Promise<void>

    /**
     * 입력 비활성화 플래그 (부모 정책 반영 시)
     *
     * 정책:
     * - 댓글 로딩/삭제 확인/페이지 전환 등 입력을 막아야 하는 경우 사용
     */
    disabled: boolean

    /**
     * 인증 여부 (UX 분기)
     *
     * 정책:
     * - 미인증 상태에서는 입력 비활성 + 로그인 안내 UI를 표시
     */
    isAuthenticated: boolean

    /**
     * 로그인 요청 액션
     *
     * 정책:
     * - 미인증 상태에서 로그인 화면으로 이동/모달 표시 등 처리를 위임
     */
    onRequestLogin: () => void
}

/**
 * ReviewCommentForm
 *
 * 책임:
 * - 댓글 입력/전송 UI를 구성
 * - 인증/로딩/전송 정책을 상위 컨테이너에서 위임받아 처리
 *
 * 인증 정책:
 * - 미인증: 입력 비활성화 + 로그인 CTA
 * - 인증: Ctrl/⌘ + Enter 전송 (IME 조합 중 방지)
 * - 제출 중 중복 방지 처리
 */
export function ReviewCommentForm({
    onSubmit,
    disabled,
    isAuthenticated,
    onRequestLogin,
}: ReviewCommentFormProps) {
    /**
     * body: textarea 입력 상태(원본 값)
     * - 화면에서 입력값 그대로 표시
     * - 실제 제출은 trim 적용
     */
    const [body, setBody] = useState<string>("")

    /**
     * isSubmitting: 제출 진행 중 플래그
     * - 버튼/입력 비활성화 UI에 반영
     * - 외부 disabled와 OR 연산으로 최종 비활성 여부를 결정
     */
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

    /**
     * submitLockedRef: 제출/중복 방지를 위한 ref 잠금
     *
     * 배경:
     * - state 반영이 안 되는 짧은 구간에 Enter 연타로 중복 제출이 발생할 수 있음
     * - ref를 동기적으로 사용하여 UX를 보호
     */
    const submitLockedRef = useRef<boolean>(false)

    /**
     * trimmedLength: 공백 제거 후 실제 길이
     * - 버튼 활성화/비활성화 여부 판단에 사용
     */
    const trimmedLength = body.trim().length

    /**
     * submitDisabled: 제출 불가 상태
     * - disabled: 부모 정책(로딩/삭제 확인 등)
     * - isSubmitting: 제출 중 중복 방지
     */
    const submitDisabled = disabled || isSubmitting

    /**
     * submit: 댓글 제출 트리거 (UX 분기)
     *
     * 단계:
     * 1) 제출 불가 상태 확인
     * 2) trim + empty/maxLength 검사
     * 3) 제출 중 플래그 설정
     * 4) onSubmit 호출
     * 5) 성공 후 입력값 초기화, 실패 후 입력값 유지
     * 6) finally에서 잠금 해제
     *
     * 정책:
     * - 에러 처리/재시도 정책은 상위 컨테이너에서 처리
     */
    async function submit(): Promise<void> {
        if (submitDisabled || submitLockedRef.current) return
        if (!isAuthenticated) {
            onRequestLogin()
            return
        }

        const trimmed: string = body.trim()
        if (trimmed.length === 0) return
        if (trimmed.length > REVIEW_COMMENT_BODY_MAX_LENGTH) return

        submitLockedRef.current = true
        setIsSubmitting(true)

        try {
            await onSubmit(trimmed)
            setBody("")
        } catch {
            // 실패 후 입력값 유지 (재전송 가능 UX)
        } finally {
            submitLockedRef.current = false
            setIsSubmitting(false)
        }
    }

    /**
     * handleKeyDown: 키보드 이벤트 처리
     *
     * 정책:
     * - Enter 단독 처리는 다음 줄 입력을 막으므로 비활성화
     * - Ctrl/⌘ + Enter로만 전송
     *
     * IME 주의:
     * - 한글 조합 중 Enter는 확인 키이므로 무시
     */
    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
        if (e.nativeEvent.isComposing) return
        if (e.key !== "Enter") return
        if (!e.ctrlKey && !e.metaKey) return
        if (submitDisabled) return

        if (!isAuthenticated) {
            onRequestLogin()
            return
        }

        e.preventDefault()
        void submit()
    }

    /**
     * 미인증 UX
     *
     * 정책:
     * - 입력 영역을 비활성화하고 안내 문구 + 로그인 버튼 표시
     */
    if (!isAuthenticated) {
        return (
            <div className="flex gap-2">
                <textarea
                    className="flex-1 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white/70"
                    value=""
                    onChange={() => undefined}
                    placeholder="로그인해야 댓글을 작성할 수 있습니다."
                    disabled
                    rows={3}
                    aria-label="댓글 입력 (로그인 필요)"
                />
                <Button variant="primary" size="md" onClick={onRequestLogin} aria-label="로그인 페이지로 이동">로그인</Button>
            </div>
        )
    }

    /**
     * 인증된 사용자 UX
     *
     * 정책:
     * - maxLength로 입력 길이 제한
     * - trimmedLength가 0이면 전송 버튼 비활성
     * - 제출 중 입력/버튼 비활성화
     */
    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <textarea
                    className="flex-1 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                    value={body}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="댓글을 입력하세요. (Ctrl/⌘ + Enter 전송)"
                    maxLength={REVIEW_COMMENT_BODY_MAX_LENGTH}
                    disabled={submitDisabled}
                    rows={3}
                />

                <Button
                    variant="primary"
                    size="sm"
                    disabled={submitDisabled || trimmedLength === 0}
                    onClick={() => void submit()}
                >
                    {isSubmitting ? "전송 중..." : "전송"}
                </Button>
            </div>

            {/* 표시 전략: raw 입력 길이 / 최대 한계 (실제 제출은 trim 기준) */}
            <div className="text-right text-xs text-white/65">
                {body.length}/{REVIEW_COMMENT_BODY_MAX_LENGTH}
            </div>
        </div>
    )
}
