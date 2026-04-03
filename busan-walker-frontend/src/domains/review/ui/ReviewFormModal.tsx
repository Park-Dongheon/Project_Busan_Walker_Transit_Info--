// src/domains/review/ui/ReviewFormModal.tsx

/**
 * ReviewFormModal.tsx (UI Layer - 리뷰 작성/수정 모달 컴포넌트)
 *
 * 역할/목적:
 * - 리뷰 생성(create) 및 수정(edit) 폼을 모달 형태로 제공하는 컴포넌트
 * - 이미지 파일 업로드를 지원하며, 업로드된 URL을 imageUrls에 포함하여 서버에 전송
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · ReviewFormMode       - 모달 모드 유니온 타입 (create | edit)
 *      · ReviewFormModalProps - ReviewFormModal 컴포넌트 props 타입
 *      · ReviewFormModal      - 리뷰 작성/수정 모달 컴포넌트
 *
 * 동작 방식:
 * - mode가 null이면 모달이 닫힘
 * - 비로그인 상태로 모달이 열리면 즉시 로그인 페이지로 리디렉션
 * - edit 모드에서는 useReviewDetail로 기존 데이터를 불러와 폼에 초기화
 * - 이미지 파일 선택 시 Object URL로 미리보기를 제공하고, useEffect로 메모리를 관리
 * - 제출 시 파일을 먼저 업로드한 뒤 기존 URL과 합쳐 최종 imageUrls를 구성
 *
 * 운영 포인트:
 * - 인증 401 응답 처리 및 로그인 리디렉션 정책은 이 파일에서 관리
 * - 이미지 업로드 실패 시 에러 메시지는 setErrorMsg와 toast를 함께 사용
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { ROUTES } from "@/app/navigation/navigation";
import { toAuthRedirectFrom } from "@/app/navigation/authRedirect";
import { api as reviewApi, lib as reviewLib } from "@/domains/review";
import { Modal } from "@/shared/ui/Modal";
import { getErrorMessage } from "@/shared/lib/apiError";
import { model as authModel } from "@/domains/auth";
import { uploadFiles } from "@/shared/api/file/upload";
import { resolveBackendAssetUrl } from "@/shared/api/core/baseURL";

/** 리뷰 모달 모드: 신규 작성 또는 기존 리뷰 수정 */
export type ReviewFormMode =
    | { type: "create" }
    | { type: "edit"; reviewId: number }

export type ReviewFormModalProps = {
    keyId: string
    /** null이면 모달 닫힘, non-null이면 해당 모드로 모달 열림 */
    mode: ReviewFormMode | null
    onClose: () => void
    /** 리뷰 생성/수정 완료 시 호출되는 콜백. 생성 시 새 reviewId, 수정 시 기존 reviewId를 전달 */
    onCreatedOrUpdated: (reviewId: number | null) => void
}

/**
 * 리뷰 작성/수정 모달 컴포넌트.
 *
 * - 비로그인 상태에서는 모달을 닫고 로그인 페이지로 리디렉션
 * - 이미지 파일은 업로드 후 URL로 변환하여 imageUrls에 포함
 */
export function ReviewFormModal({ keyId, mode, onClose, onCreatedOrUpdated }: ReviewFormModalProps) {
    const { user } = authModel.useAuth()
    const navigate = useNavigate()
    const location = useLocation()

    const isAuthenticated: boolean = Boolean(user)
    const open: boolean = mode != null

    const editingReviewId: number | null = mode?.type === "edit" ? mode.reviewId : null

    const detailQuery = reviewApi.useReviewDetail(keyId, editingReviewId)

    const createMut = reviewApi.useCreateReviewMutation(keyId)
    const updateMut = reviewApi.useUpdateReviewMutation(keyId, editingReviewId ?? -1)

    const [rating, setRating] = useState<number>(5)
    const [body, setBody] = useState<string>("")
    const [existingImageUrls, setExistingImageUrls] = useState<string[]>([])
    const [imageFiles, setImageFiles] = useState<File[]>([])
    const [isUploading, setIsUploading] = useState<boolean>(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // 새로 선택한 이미지 파일의 Object URL로 미리보기를 제공 (렌더링 시 생성)
    const previewUrls = useMemo<string[]>(
        () => imageFiles.map((file) => URL.createObjectURL(file)),
        [imageFiles]
    )
    const resolvedExistingImageUrls = useMemo<string[]>(
        () =>
            existingImageUrls
                .map((url) => resolveBackendAssetUrl(url))
                .filter((url): url is string => typeof url === "string" && url.length > 0),
        [existingImageUrls]
    )

    // previewUrls가 변경될 때 이전 Object URL을 revoke하여 메모리 누수 방지
    useEffect(() => {
        return () => {
            previewUrls.forEach((url) => URL.revokeObjectURL(url))
        }
    }, [previewUrls])

    /**
     * 모달이 열렸는데 로그인이 안 되어 있다면 로그인 화면으로 이동.
     *
     * - 로그인 완료 후 복귀할 수 있도록 현재 경로를 state.from으로 전달
     */
    useEffect(() => {
        if (!open) return
        if (isAuthenticated) return

        toast.info("리뷰 작성은 로그인 후 가능합니다.")
        navigate(ROUTES.login, {
            state: { from: toAuthRedirectFrom(location) },
        })
        onClose()

    }, [open, isAuthenticated, navigate, location, onClose])

    // edit 모드에서 상세 데이터를 불러오면 폼 초기값을 설정하여 기존 리뷰 내용 반영
    useEffect(() => {
        if (!open) return
        if (mode?.type !== "edit") return
        if (!detailQuery.data) return

        setRating(detailQuery.data.rating)
        setBody(detailQuery.data.body)
        setExistingImageUrls(reviewLib.normalizeReviewImageUrls(detailQuery.data.imageUrls))
        setImageFiles([])
        setErrorMsg(null)
    }, [open, mode?.type, detailQuery.data])

    // create 모드로 열릴 때 폼을 초기화하여 이전 입력 내용 제거
    useEffect(() => {
        if (!open) return
        if (mode?.type !== "create") return

        setRating(5)
        setBody("")
        setExistingImageUrls([])
        setImageFiles([])
        setErrorMsg(null)
    }, [open, mode?.type])

    function requestLogin(message?: string): void {
        toast.info(message ?? "로그인이 필요합니다.")
        navigate(ROUTES.login, {
            state: { from: toAuthRedirectFrom(location) },
        })
    }

    function isUnauthorized(error: unknown): boolean {
        return isAxiosError(error) && error.response?.status === 401
    }

    /**
     * 폼 제출 전 유효성 검사.
     *
     * - 위반 시 한국어 에러 메시지를 반환하고, 정상이면 null 반환
     */
    function validate(): string | null {
        const r: number = Number(rating)
        if (!Number.isFinite(r) || r < 1 || r > 5) return "평점은 1~5 사이여야 합니다."

        const b: string = body.trim()
        if (b.length === 0) return "본문을 입력해 주세요."

        return null
    }

    function handleImageFilesChange(e: React.ChangeEvent<HTMLInputElement>): void {
        const files = Array.from(e.currentTarget.files ?? [])
        if (files.length === 0) return

        const nextFiles = [...imageFiles, ...files]
        const fileValidation = reviewLib.validateReviewImageFiles(nextFiles, {
            currentImageCount: existingImageUrls.length,
        })

        if (fileValidation) {
            setErrorMsg(fileValidation)
            toast.error(fileValidation)
            e.currentTarget.value = ""
            return
        }

        setErrorMsg(null)
        setImageFiles(nextFiles)
        e.currentTarget.value = ""
    }

    function removeExistingImage(index: number): void {
        setExistingImageUrls((prev) => prev.filter((_, i) => i !== index))
    }

    const pending: boolean = createMut.isPending || updateMut.isPending || isUploading

    async function submit(): Promise<void> {
        if (!isAuthenticated) {
            requestLogin("리뷰 작성은 로그인 후 가능합니다.")
            return
        }

        setErrorMsg(null)

        const validationError: string | null = validate()
        if (validationError) {
            setErrorMsg(validationError)
            return
        }

        try {
            setIsUploading(true)

            const fileValidation = reviewLib.validateReviewImageFiles(imageFiles, {
                currentImageCount: existingImageUrls.length,
            })
            if (fileValidation) {
                setErrorMsg(fileValidation)
                return
            }

            const uploadedUrls = imageFiles.length > 0 ? await uploadFiles(imageFiles) : []
            const mergedUrls = reviewLib.normalizeReviewImageUrls([...existingImageUrls, ...uploadedUrls])
            const mergedValidation = reviewLib.validateReviewImageUrls(mergedUrls)
            if (mergedValidation) {
                const message = mergedValidation
                setErrorMsg(message)
                return
            }

            const payload = {
                rating: Number(rating),
                body: body.trim(),
                imageUrls: mergedUrls,
            }

            if (mode?.type === "edit") {
                if (editingReviewId == null) return

                await updateMut.mutateAsync(payload)
                onCreatedOrUpdated(editingReviewId)
            } else {
                const createdId: number = await createMut.mutateAsync(payload)
                onCreatedOrUpdated(createdId)
            }

            setExistingImageUrls(mergedUrls)
            setImageFiles([])
            toast.success("리뷰가 저장되었습니다.")
            onClose()
        } catch (err: unknown) {
            if (isUnauthorized(err)) {
                requestLogin("인증이 만료되었습니다. 다시 로그인해 주세요.")
                return
            }

            const msg: string = getErrorMessage(err, "리뷰 저장에 실패했습니다.")
            setErrorMsg(msg)
            toast.error(msg)
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <Modal
            open={open}
            title={mode?.type === "edit" ? "리뷰 수정" : "리뷰 작성"}
            onClose={onClose}
            closeDisabled={pending}
        >
            {mode?.type === "edit" && detailQuery.isLoading ? (
                <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white/80">리뷰 데이터를 불러오는 중...</div>
            ) : null}

            <div className="space-y-5">
                <div>
                    <label htmlFor="reviewRating" className="block text-sm font-semibold text-white/90">
                        평점 (1~5)
                    </label>
                    <input
                        id="reviewRating"
                        type="number"
                        min={1}
                        max={5}
                        className="mt-1 w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-white/45 outline-none transition focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                        value={rating}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRating(Number(e.target.value))}
                        disabled={pending}
                    />
                </div>

                <div>
                    <label htmlFor="reviewBody" className="block text-sm font-semibold text-white/90">
                        본문
                    </label>
                    <textarea
                        id="reviewBody"
                        value={body}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
                        className="mt-1 h-36 w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-white/45 outline-none transition focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                        maxLength={2000}
                        disabled={pending}
                        placeholder="리뷰 내용을 작성하세요."
                    />
                    <div className="mt-1 text-xs text-white/65">{body.length}/2000</div>
                </div>

                {resolvedExistingImageUrls.length > 0 ? (
                    <div>
                        <label className="mb-2 block text-sm font-semibold text-white/90">
                            기존 이미지
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {resolvedExistingImageUrls.map((url, index) => (
                                <div key={`${url}-${index}`} className="relative">
                                    <img
                                        src={url}
                                        alt={`existing-${index + 1}`}
                                        className="h-20 w-full rounded-lg object-cover"
                                    />
                                    <button
                                        type="button"
                                        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white hover:bg-red-700"
                                        disabled={pending}
                                        onClick={() => removeExistingImage(index)}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div>
                    <label htmlFor="reviewImageFiles" className="block text-sm font-semibold text-white/90">
                        이미지 파일 업로드
                    </label>
                    <input
                        id="reviewImageFiles"
                        type="file"
                        multiple
                        accept="image/*"
                        className="mt-1 block w-full text-xs text-white/80 file:rounded-lg file:border file:border-white/15 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:text-white file:cursor-pointer hover:file:bg-white/20"
                        disabled={pending}
                        onChange={handleImageFilesChange}
                    />
                    {imageFiles.length > 0 ? (
                        <p className="mt-1 text-xs text-white/65">선택된 파일 {imageFiles.length}개</p>
                    ) : existingImageUrls.length > 0 ? (
                        <p className="mt-1 text-xs text-white/65">기존 이미지 {existingImageUrls.length}개 유지</p>
                    ) : null}
                </div>

                {previewUrls.length > 0 ? (
                    <div>
                        <label className="mb-2 block text-sm font-semibold text-white/90">업로드 미리보기</label>
                        <div className="grid grid-cols-3 gap-2">
                            {previewUrls.map((url, index) => (
                                <div key={`${url}-${index}`} className="relative">
                                    <img src={url}
                                         alt={`preview-${index + 1}`}
                                         className="h-20 w-full rounded-lg object-cover" />
                                    <button
                                        type="button"
                                        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white hover:bg-red-700"
                                        disabled={pending}
                                        onClick={() => {
                                            setImageFiles((prev) => prev.filter((_, i) => i !== index))
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {errorMsg ? (
                    <div className="rounded-xl border border-red-400/60 bg-red-500/15 px-3 py-2 text-sm text-red-100">
                        {errorMsg}
                    </div>
                ) : null}

                <div className="sticky bottom-0 -mx-5 mt-2 flex justify-end gap-2 border-t border-white/10 bg-black/30 px-5 py-4 backdrop-blur-sm">
                    <button
                        type="button"
                        className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={onClose}
                        disabled={pending}
                    >
                        닫기
                    </button>
                    <button
                        type="button"
                        className="rounded-xl border border-transparent bg-sky-500/85 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100/80 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void submit()}
                        disabled={pending}
                    >
                        {pending ? "저장 중..." : "저장"}
                    </button>
                </div>
            </div>
        </Modal>
    )
}
