// src/domains/review/ui/ReviewCard.tsx

/**
 * ReviewCard.tsx (UI Layer - 리뷰 카드 컴포넌트)
 *
 * 역할/목적:
 * - 리뷰 1건의 정보를 카드 형태로 표시하고, 수정/삭제/좋아요/댓글 보기 기능을 제공
 * - 카드 클릭으로 펼치기/접기가 가능하며, 펼침 시 댓글 목록이 인라인으로 표시
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · ReviewCardProps  - ReviewCard 컴포넌트 props 타입
 *      · ReviewCard       - 리뷰 카드 컴포넌트
 *
 * 동작 방식:
 * - 편집 모드(editMode)에서는 인라인 폼으로 전환되고, 저장 시 updateMutation을 호출
 * - 이미지 파일 선택 시 Object URL을 생성하고 useEffect로 메모리 누수를 방지
 * - 비로그인 또는 401 응답 시 로그인 페이지로 리디렉션하며 현재 경로를 state로 전달
 * - canManage는 작성자 본인 또는 ADMIN 역할일 때 true
 *
 * 운영 포인트:
 * - COLLAPSED_IMAGE_PREVIEW_COUNT 변경 시 접힘 상태의 이미지 미리보기 개수가 달라짐
 */
import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'

import { ROUTES } from '@/app/navigation/navigation'
import { toAuthRedirectFrom } from '@/app/navigation/authRedirect'
import { model as authModel } from '@/domains/auth'
import type { ReviewCardResponse } from '@/domains/review'
import { api as reviewApi, lib as reviewLib, ui as reviewUi } from '@/domains/review'
import { resolveBackendAssetUrl } from '@/shared/api/core/baseURL'
import { uploadFiles } from '@/shared/api/file/upload'
import { getErrorMessage } from '@/shared/lib/apiError'

const COLLAPSED_IMAGE_PREVIEW_COUNT = 3

export type ReviewCardProps = {
    item: ReviewCardResponse
    keyId: string
    isLikePending?: boolean
    onToggleLike: (reviewId: number, nextLiked: boolean) => void
}

/**
 * 리뷰 카드 컴포넌트
 *
 * - 편집 모드와 보기 모드를 로컬 상태로 전환하며 서버 요청은 mutation 훅에 위임
 * - 이미지 Object URL은 previewUrls 변경 시마다 이전 URL을 revoke하여 메모리 누수 방지
 */
export function ReviewCard({ item, keyId, isLikePending = false, onToggleLike }: ReviewCardProps) {
    const { user } = authModel.useAuth()
    const navigate = useNavigate()
    const location = useLocation()

    const isAuthenticated = Boolean(user)
    const edited = reviewLib.isEdited(item.createdAt, item.updatedAt)

    const itemImageUrls = useMemo(() => reviewLib.normalizeReviewImageUrls(item.imageUrls), [item.imageUrls])
    const resolvedItemImageUrls = useMemo(
        () => itemImageUrls.map((url) => resolveBackendAssetUrl(url)).filter((url): url is string => typeof url === 'string' && url.length > 0),
        [itemImageUrls],
    )

    const [expanded, setExpanded] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [editBody, setEditBody] = useState(item.body)
    const [editRating, setEditRating] = useState(item.rating)
    const [editImageUrls, setEditImageUrls] = useState<string[]>(itemImageUrls)
    const [imageFiles, setImageFiles] = useState<File[]>([])

    const deleteMutation = reviewApi.useDeleteReviewMutation(keyId, item.reviewId)
    const updateMutation = reviewApi.useUpdateReviewMutation(keyId, item.reviewId)

    /**
     * 현재 로그인 사용자가 이 리뷰를 관리(수정/삭제)할 수 있는지 판단.
     *
     * - ADMIN 역할이거나 작성자 본인이면 true 반환
     * - authorId가 null이면(탈퇴 계정) 본인 확인 불가로 false 반환
     */
    const canManage = useMemo(() => {
        const viewerId = user?.id ?? null
        const viewerRole = user?.role ?? null
        const authorId = item.authorId == null ? null : String(item.authorId)

        if (viewerRole === 'ADMIN') return true
        if (viewerId == null || authorId == null) return false
        return viewerId === authorId
    }, [item.authorId, user?.id, user?.role])

    const previewUrls = useMemo(() => imageFiles.map((file) => URL.createObjectURL(file)), [imageFiles])

    useEffect(() => {
        return () => {
            previewUrls.forEach((url) => URL.revokeObjectURL(url))
        }
    }, [previewUrls])

    useEffect(() => {
        if (editMode) return
        setEditBody(item.body)
        setEditRating(item.rating)
        setEditImageUrls(itemImageUrls)
        setImageFiles([])
    }, [editMode, item.body, item.rating, itemImageUrls])

    /**
     * 로그인 페이지로 이동하며 현재 경로를 state.from으로 전달.
     *
     * - 로그인 완료 후 원래 화면으로 복귀할 수 있도록 from 정보를 보존하여 전달
     */
    function requestLogin(message?: string): void {
        toast.info(message ?? '로그인이 필요합니다.')
        navigate(ROUTES.login, {
            state: { from: toAuthRedirectFrom(location) },
        })
    }

    /**
     * 서버 응답이 401(Unauthorized)인지 판별.
     *
     * - 비로그인/세션 만료/토큰 무효 등 인증 실패 케이스를 UI에서 일관된 흐름으로 처리하기 위한 헬퍼
     */
    function isUnauthorized(error: unknown): boolean {
        return isAxiosError(error) && error.response?.status === 401
    }

    /**
     * 편집 모드로 진입하고 현재 리뷰 데이터로 폼을 초기화.
     *
     * - canManage가 false이면 무시
     */
    function openEditMode(): void {
        if (!canManage) return
        setEditBody(item.body)
        setEditRating(item.rating)
        setEditImageUrls(itemImageUrls)
        setImageFiles([])
        setEditMode(true)
    }

    /**
     * 편집 취소 시 폼 상태를 원래 리뷰 데이터로 초기화.
     *
     * - editMode를 false로 전환하고 상태를 원본으로 복원
     */
    function cancelEdit(): void {
        setEditBody(item.body)
        setEditRating(item.rating)
        setEditImageUrls(itemImageUrls)
        setImageFiles([])
        setEditMode(false)
    }

    function removeExistingImage(index: number): void {
        setEditImageUrls((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
    }

    /**
     * 파일 입력 변경 시 새 이미지 파일을 검증하고 상태에 추가.
     *
     * - 유효성 검사 실패 시 토스트 오류를 표시하고 입력 초기화
     */
    function handleEditFileChange(event: ChangeEvent<HTMLInputElement>): void {
        const files = Array.from(event.currentTarget.files ?? [])
        if (files.length === 0) return

        const nextFiles = [...imageFiles, ...files]
        const validationError = reviewLib.validateReviewImageFiles(nextFiles, {
            currentImageCount: editImageUrls.length,
        })

        if (validationError) {
            toast.error(validationError)
            event.currentTarget.value = ''
            return
        }

        setImageFiles(nextFiles)
        event.currentTarget.value = ''
    }

    /**
     * 리뷰 삭제를 수행.
     *
     * - 비로그인 시 로그인 페이지로 리디렉션
     * - confirm 다이얼로그로 실수 삭제 방지
     */
    async function onDelete(): Promise<void> {
        if (!isAuthenticated) {
            requestLogin('리뷰 삭제는 로그인 후 가능합니다.')
            return
        }

        if (!canManage) return
        if (!window.confirm('리뷰를 삭제할까요?')) return

        try {
            await deleteMutation.mutateAsync()
            toast.success('리뷰가 삭제되었습니다.')
        } catch (error: unknown) {
            if (isUnauthorized(error)) {
                requestLogin('인증이 만료되었습니다. 다시 로그인해 주세요.')
                return
            }
            toast.error(getErrorMessage(error, '리뷰 삭제에 실패했습니다.'))
        }
    }

    /**
     * 편집 내용을 저장.
     *
     * - 새 이미지 파일을 업로드한 뒤 기존 URL과 합쳐 최종 imageUrls 구성
     * - 저장 성공 시 편집 모드를 종료하고 이미지 상태 갱신
     */
    async function onSaveEdit(): Promise<void> {
        if (!isAuthenticated || !canManage) return

        const rating = Number(editRating)
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            toast.error('평점은 1~5 사이의 정수로 입력해 주세요.')
            return
        }

        const body = editBody.trim()
        if (body.length === 0) {
            toast.error('본문을 입력해 주세요.')
            return
        }

        const fileValidation = reviewLib.validateReviewImageFiles(imageFiles, {
            currentImageCount: editImageUrls.length,
        })
        if (fileValidation) {
            toast.error(fileValidation)
            return
        }

        try {
            const newImageUrls = imageFiles.length > 0 ? await uploadFiles(imageFiles) : []
            const allImageUrls = reviewLib.normalizeReviewImageUrls([...editImageUrls, ...newImageUrls])
            const imageValidation = reviewLib.validateReviewImageUrls(allImageUrls)
            if (imageValidation) {
                toast.error(imageValidation)
                return
            }

            await updateMutation.mutateAsync({ rating, body, imageUrls: allImageUrls })
            setEditMode(false)
            setImageFiles([])
            setEditImageUrls(allImageUrls)
            toast.success('리뷰가 수정되었습니다.')
        } catch (error: unknown) {
            if (isUnauthorized(error)) {
                requestLogin('인증이 만료되었습니다. 다시 로그인해 주세요.')
                return
            }
            toast.error(getErrorMessage(error, '리뷰 수정에 실패했습니다.'))
        }
    }

    function toggleExpanded(): void {
        setExpanded((prev) => !prev)
    }

    /**
     * 키보드 접근성: Enter 또는 Space 키로 카드 펼치기/접기를 지원.
     *
     * - preventDefault로 스크롤 이동 등 기본 동작 방지
     */
    function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggleExpanded()
        }
    }

    if (editMode) {
        return (
            <div className='space-y-3 rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur'>
                <div>
                    <label className='block text-sm font-semibold text-white'>평점 (1~5)</label>
                    <input
                        type='number'
                        min={1}
                        max={5}
                        step={1}
                        className='mt-1 w-full rounded-2xl border border-white/15 bg-white/15 px-3 py-2 text-sm text-white'
                        value={editRating}
                        onChange={(event) => setEditRating(Number(event.target.value))}
                        disabled={updateMutation.isPending}
                    />
                </div>

                <div>
                    <label className='block text-sm font-semibold text-white'>본문</label>
                    <textarea
                        className='mt-1 h-32 w-full rounded-2xl border border-white/15 bg-white/15 px-3 py-2 text-sm text-white'
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                        maxLength={2000}
                        disabled={updateMutation.isPending}
                    />
                    <div className='mt-1 text-xs text-white/70'>{editBody.length}/2000</div>
                </div>

                <div>
                    <label className='mb-2 block text-sm font-semibold text-white'>기존 이미지 ({editImageUrls.length}개)</label>
                    {editImageUrls.length > 0 ? (
                        <div className='grid grid-cols-3 gap-2'>
                            {editImageUrls.map((url, index) => (
                                <div key={`${url}-${index}`} className='relative'>
                                    <img src={url} alt={`기존 이미지 ${index + 1}`} className='h-20 w-full rounded-lg object-cover' />
                                    <button
                                        type='button'
                                        className='absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white hover:bg-red-700'
                                        onClick={() => removeExistingImage(index)}
                                        disabled={updateMutation.isPending}
                                        aria-label={`기존 이미지 ${index + 1} 제거`}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className='text-xs text-white/65'>등록된 이미지가 없습니다.</p>
                    )}
                </div>

                <div>
                    <label className='mb-2 block text-sm font-semibold text-white'>새 이미지 추가</label>
                    <input
                        type='file'
                        multiple
                        accept='image/*'
                        className='block w-full text-xs text-white/80 file:cursor-pointer file:rounded-lg file:border file:border-white/15 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:text-white hover:file:bg-white/20'
                        onChange={handleEditFileChange}
                        disabled={updateMutation.isPending}
                    />
                    {imageFiles.length > 0 ? <div className='mt-2 text-xs text-white/70'>선택된 파일: {imageFiles.length}개</div> : null}
                </div>

                {previewUrls.length > 0 ? (
                    <div>
                        <label className='mb-2 block text-sm font-semibold text-white'>추가할 이미지 미리보기</label>
                        <div className='grid grid-cols-3 gap-2'>
                            {previewUrls.map((url, index) => (
                                <div key={`${url}-${index}`} className='relative'>
                                    <img src={url} alt={`새 이미지 ${index + 1}`} className='h-20 w-full rounded-lg object-cover' />
                                    <button
                                        type='button'
                                        className='absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white hover:bg-red-700'
                                        onClick={() => setImageFiles((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
                                        disabled={updateMutation.isPending}
                                        aria-label={`새 이미지 ${index + 1} 제거`}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div className='flex justify-end gap-2'>
                    <button
                        type='button'
                        className='rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20'
                        onClick={cancelEdit}
                        disabled={updateMutation.isPending}
                    >
                        취소
                    </button>
                    <button
                        type='button'
                        className='rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50'
                        onClick={() => void onSaveEdit()}
                        disabled={updateMutation.isPending}
                    >
                        {updateMutation.isPending ? '저장 중...' : '저장'}
                    </button>
                </div>

                {expanded ? (
                    <div className='border-t border-white/10 pt-4'>
                        <reviewUi.ReviewCommentList keyId={keyId} reviewId={item.reviewId} />
                    </div>
                ) : null}
            </div>
        )
    }

    const imagePreviewUrls = expanded
        ? resolvedItemImageUrls
        : resolvedItemImageUrls.slice(0, COLLAPSED_IMAGE_PREVIEW_COUNT)
    const hiddenImageCount = resolvedItemImageUrls.length - imagePreviewUrls.length

    return (
        <div className='rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur'>
            <div
                role='button'
                tabIndex={0}
                aria-expanded={expanded}
                aria-label='리뷰 카드 펼치기 또는 접기'
                className='w-full text-left'
                onClick={toggleExpanded}
                onKeyDown={handleCardKeyDown}
            >
                <div className='flex items-start justify-between gap-3'>
                    <div className='flex flex-1 flex-col gap-2'>
                        <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-3'>
                                <div className='text-sm font-semibold text-white'>{item.authorName}</div>
                                <div className='text-xs text-white/70'>
                                    {reviewLib.formatDateTime(item.createdAt)}
                                    {edited ? ' · 수정됨' : ''}
                                </div>
                            </div>

                            {canManage ? (
                                <div className='flex gap-2' onClick={(event) => event.stopPropagation()}>
                                    <button
                                        type='button'
                                        className='rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20'
                                        onClick={openEditMode}
                                    >
                                        수정
                                    </button>
                                    <button
                                        type='button'
                                        className='rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50'
                                        onClick={() => void onDelete()}
                                        disabled={deleteMutation.isPending}
                                    >
                                        {deleteMutation.isPending ? '삭제 중...' : '삭제'}
                                    </button>
                                </div>
                            ) : null}
                        </div>

                        <div className='flex items-center gap-3 text-sm text-white/80'>
                            <span className='font-semibold'>평점 {item.rating}</span>
                            <span>좋아요 {item.likeCount}</span>
                            <span>댓글 {item.commentCount}</span>
                        </div>

                        <div className={`${expanded ? '' : 'line-clamp-3'} whitespace-pre-wrap text-sm text-white/80`}>
                            {item.body}
                        </div>

                        {imagePreviewUrls.length > 0 ? (
                            <div className='mt-3 space-y-2'>
                                <div className='grid grid-cols-3 gap-2'>
                                    {imagePreviewUrls.map((url, index) => (
                                        <a
                                            key={`${url}-${index}`}
                                            href={url}
                                            target='_blank'
                                            rel='noreferrer'
                                            onClick={(event) => event.stopPropagation()}
                                            className='block overflow-hidden rounded-lg'
                                            aria-label={`리뷰 이미지 ${index + 1} 원본 보기`}
                                        >
                                            <img src={url} alt={`리뷰 이미지 ${index + 1}`} className='h-20 w-full object-cover transition hover:scale-105' />
                                        </a>
                                    ))}
                                </div>
                                <div className='text-xs text-white/70'>
                                    이미지 {itemImageUrls.length}개
                                    {!expanded && hiddenImageCount > 0 ? ` · +${hiddenImageCount}개 더 보기` : ''}
                                </div>
                            </div>
                        ) : null}

                        {!expanded ? <div className='mt-2 text-xs text-white/70'>댓글 {item.commentCount}개 · 클릭해서 댓글 보기</div> : null}
                    </div>

                    <button
                        type='button'
                        className={`shrink-0 rounded-2xl px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            item.likedByMe ? 'bg-red-600/10 text-red-400' : 'bg-white/15 text-white/80 hover:bg-white/20'
                        }`}
                        onClick={(event) => {
                            event.stopPropagation()
                            if (isLikePending) return
                            onToggleLike(item.reviewId, !item.likedByMe)
                        }}
                        disabled={isLikePending}
                        aria-busy={isLikePending}
                        aria-label='좋아요 토글'
                    >
                        {isLikePending ? '처리 중...' : item.likedByMe ? '좋아요 취소' : '좋아요'}
                    </button>
                </div>
            </div>

            {expanded ? (
                <div className='mt-4 border-t border-white/10 pt-4'>
                    <reviewUi.ReviewCommentList keyId={keyId} reviewId={item.reviewId} />
                </div>
            ) : null}
        </div>
    )
}
