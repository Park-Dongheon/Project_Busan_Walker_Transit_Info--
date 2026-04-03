// src/shared/api/file/upload.ts

/**
 * upload.ts (Shared API File - 파일 업로드 API)
 *
 * 역할/목적:
 * - 이미지/파일을 멀티파트 형식으로 서버에 업로드하고 접근 URL을 반환
 * - 단일 파일(uploadFile) 및 여러 파일 일괄(uploadFiles) 업로드를 제공
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · uploadFile   - 단일 파일을 업로드하고 서버가 반환한 URL을 반환
 *      · uploadFiles  - 여러 파일을 순차 업로드하고 URL 배열을 반환
 * - 공용 api 인스턴스를 사용하므로 인증 헤더/CSRF 주입은 인터셉터가 자동 처리
 *
 * 동작 방식:
 * - FormData에 file 필드로 파일을 첨부하여 POST /files/upload 호출
 * - uploadFiles는 순차 업로드하며, 네트워크 오류(response 없음) 시 사용자 친화적 에러 메시지로 변환
 *
 * 운영 포인트:
 * - 업로드 엔드포인트(/files/upload)가 변경되면 uploadFile 내 경로 수정 필요
 * - 대용량 파일 업로드 시 별도의 진행률 표시(onUploadProgress) 추가를 고려
 */

import { isAxiosError } from "axios";
import { api } from "@/shared/api/core/client";

/**
 * 단일 파일을 서버에 업로드하고 접근 URL을 반환
 *
 * - FormData에 "file" 키로 첨부하여 POST /files/upload 호출
 * - 응답 body의 url 필드(서버가 반환한 업로드된 파일 경로)를 반환
 */
export async function uploadFile(file: File): Promise<string> {
    const formData = new FormData()
    formData.append("file", file)

    const res = await api.post<{ url: string }>("/files/upload", formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    })

    return res.data.url
}

/**
 * 여러 파일을 순차적으로 업로드하고 URL 배열을 반환
 *
 * - 각 파일을 uploadFile로 순차 업로드하여 URL을 수집
 * - 네트워크 연결 오류(response 없음)는 사용자 친화적 메시지로 변환하여 throw
 * - 그 외 오류(4xx/5xx 등)는 그대로 re-throw하여 호출부에서 처리하도록 위임
 */
export async function uploadFiles(files: File[]): Promise<string[]> {
    const urls: string[] = []
    for (const file of files) {
        try {
            const url = await uploadFile(file)
            urls.push(url)
        } catch (error: unknown) {
            if (isAxiosError(error) && !error.response) {
                throw new Error("업로드 중 네트워크 연결이 끊어졌습니다. 백엔드 상태와 파일 크기를 확인 후 다시 시도해 주세요.")
            }
            throw error
        }
    }
    return urls
}
