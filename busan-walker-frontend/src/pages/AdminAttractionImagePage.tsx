// src/pages/AdminAttractionImagePage.tsx

/**
 * AdminAttractionImagePage.tsx (Page - 관광지 대표 이미지 교체 페이지)
 *
 * 역할/목적:
 * - ADMIN 역할 사용자가 특정 관광지의 대표 이미지를 교체하는 관리자 전용 페이지
 * - 라우터 레벨의 RequireAuth(allowedRoles: ["ADMIN"])에 의해 보호됨
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · AdminAttractionImagePage
 *
 * 동작 방식:
 * - keyId 입력 후 이미지 파일을 선택하면 미리보기 표시
 * - 제출 시 POST /admin/attractions/{keyId}/image 호출
 * - 성공 시 교체된 이미지를 결과 영역에 표시하고 toast 알림
 * - 업로드 결과가 표시된 상태에서 keyId 또는 파일을 변경하면 결과를 초기화
 *
 * 운영 포인트:
 * - 미리보기 URL(createObjectURL)은 컴포넌트 언마운트 시 자동 해제가 필요하지 않음
 *   (파일 교체 시 이전 URL을 revokeObjectURL로 해제하여 메모리 누수를 방지)
 */

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { AttractionImageUploadResponse } from "@/domains/admin"
import { api as adminApi } from "@/domains/admin"
import { getErrorMessage } from '@/shared/lib/apiError'
import { Button } from '@/shared/ui/Button'

export default function AdminAttractionImagePage() {
    const [keyId, setKeyId] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [result, setResult] = useState<AttractionImageUploadResponse | null>(null)

    const fileInputRef = useRef<HTMLInputElement>(null)

    const uploadMutation = useMutation({
        mutationFn: ({ keyId, file }: { keyId: string; file: File }) =>
            adminApi.uploadAttractionCoverImage(keyId, file),
        onSuccess: (data) => {
            toast.success('대표 이미지가 교체되었습니다.')
            setResult(data)
        },
        onError: (error: unknown) => {
            toast.error(getErrorMessage(error, '이미지 업로드에 실패했습니다.'))
        },
    })

    function handleKeyIdChange(e: ChangeEvent<HTMLInputElement>): void {
        setKeyId(e.target.value)
        setResult(null)
    }

    function handleFileChange(e: ChangeEvent<HTMLInputElement>): void {
        const selected = e.target.files?.[0] ?? null

        // 이전 미리보기 URL 해제 (메모리 누수 방지)
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl)
        }

        setFile(selected)
        setResult(null)
        setPreviewUrl(selected ? URL.createObjectURL(selected) : null)
    }

    function handleSubmit(e: FormEvent<HTMLFormElement>): void {
        e.preventDefault()
        if (!keyId.trim() || !file) return
        uploadMutation.mutate({ keyId: keyId.trim(), file })
    }

    function handleReset(): void {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setKeyId('')
        setFile(null)
        setPreviewUrl(null)
        setResult(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const canSubmit = keyId.trim().length > 0 && file !== null && !uploadMutation.isPending

    return (
        <div className='mx-auto max-w-2xl space-y-6'>
            {/* 업로드 폼 */}
            <div className='rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur'>
                <h1 className='text-lg font-semibold text-white'>관광지 대표 이미지 교체</h1>
                <p className='mt-1 text-sm text-white/60'>
                    관광지 KeyId를 입력하고 새 이미지를 선택하면 기존 이미지가 교체됩니다.
                </p>

                <form onSubmit={handleSubmit} className='mt-5 space-y-4'>
                    {/* KeyId 입력 */}
                    <div>
                        <label className='block text-sm font-medium text-white'>
                            관광지 KeyId
                        </label>
                        <input
                            type='text'
                            value={keyId}
                            onChange={handleKeyIdChange}
                            placeholder='예: 125A3B'
                            disabled={uploadMutation.isPending}
                            className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:opacity-50'
                        />
                    </div>

                    {/* 파일 선택 */}
                    <div>
                        <label className='block text-sm font-medium text-white'>
                            이미지 파일
                        </label>
                        <input
                            ref={fileInputRef}
                            type='file'
                            accept='image/jpeg,image/png,image/webp,image/gif'
                            onChange={handleFileChange}
                            disabled={uploadMutation.isPending}
                            className='mt-1 block w-full text-sm text-white/80 file:mr-3 file:cursor-pointer file:rounded-2xl file:border-0 file:bg-white/15 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-white/25 disabled:opacity-50'
                        />
                        <p className='mt-1 text-xs text-white/40'>
                            JPG · PNG · WebP · GIF &nbsp;/&nbsp; 최대 5MB
                        </p>
                    </div>

                    {/* 미리보기 */}
                    {previewUrl && (
                        <div>
                            <p className='text-sm font-medium text-white/70'>미리보기</p>
                            <img
                                src={previewUrl}
                                alt='선택한 이미지 미리보기'
                                className='mt-2 h-52 w-full rounded-2xl object-cover'
                            />
                        </div>
                    )}

                    <div className='flex gap-3'>
                        <Button
                            type='submit'
                            variant='primary'
                            disabled={!canSubmit}
                            loading={uploadMutation.isPending}
                            loadingText='업로드 중...'
                        >
                            이미지 교체
                        </Button>
                        <Button
                            type='button'
                            variant='ghost'
                            onClick={handleReset}
                            disabled={uploadMutation.isPending}
                        >
                            초기화
                        </Button>
                    </div>
                </form>
            </div>

            {/* 업로드 결과 */}
            {result && (
                <div className='rounded-3xl border border-green-400/30 bg-green-500/10 p-6 backdrop-blur'>
                    <p className='text-sm font-semibold text-green-200'>교체 완료</p>
                    <p className='mt-1 text-xs text-white/60'>KeyId: {result.keyId}</p>
                    <img
                        src={result.imageUrl}
                        alt='교체된 대표 이미지'
                        className='mt-3 h-52 w-full rounded-2xl object-cover'
                    />
                    <a
                        href={result.imageUrl}
                        target='_blank'
                        rel='noreferrer'
                        className='mt-2 block truncate text-xs text-blue-300 hover:underline'
                    >
                        {result.imageUrl}
                    </a>
                </div>
            )}
        </div>
    )
}
