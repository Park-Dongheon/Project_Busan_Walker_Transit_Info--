// src/domains/favorite/ui/FavoriteButton.tsx

/**
 * FavoriteButton (즐겨찾기 토글 컨테이너 컴포넌트)
 *
 * 역할/목적:
 * - 관광지 카드/상세 화면에서 "즐겨찾기 토글"에 관한 UX 정책을 캡슐화하는 컨테이너 컴포넌트
 *
 * 공개 정책 / 설계 원칙:
 * - 이 컴포넌트: UX 정책(인증 여부 확인, 옵티미스틱 업데이트, 중복 클릭 차단, 실패 롤백, 사용자 피드백)을 담당
 * - FavoriteToggleButton: 실제 버튼/아이콘 렌더링(표현 계층)을 담당
 *
 * 일관성(Consistency) 정책:
 * - UI 반응성을 보장하기 위해 로컬 옵티미스틱 상태(optimisticFavorite)로 사용자 클릭 즉시 상태 반영
 * - 최종 상태(source of truth)는 서버 + React Query 캐시이며,
 *   상위에서 내려온 isFavorite이 바뀌면 로컬 상태를 즉시 동기화해 최종 일관성으로 수렴
 *
 * 보안/권한 주의:
 * - 즐겨찾기 추가/제거는 인증이 필요한 Command API
 * - 비로그인 사용자는 조작을 차단하고 안내 메시지를 제공
 *
 * 동작 방식:
 * - isMountedRef를 통해 언마운트 이후 비동기 콜백에서 setState/toast 호출을 방지
 * - clickLockRef + lockTimeoutRef로 빠른 연타/중복 클릭을 차단하고 최악의 경우 자동 해제
 */
import { useEffect, useRef, useState } from "react";
import { useFavoriteToggle } from "@/domains/favorite/api";
import { model as authModel } from "@/domains/auth";
import { getErrorMessage } from "@/shared/lib/apiError";
import { toast } from "sonner";
import FavoriteToggleButton from "./FavoriteToggleButton";

type FavoriteButtonProps = {
    /**
     * attractionId
     * - 즐겨찾기 대상이 되는 관광지 식별자(keyId)
     * - API path segment에 사용되므로, "빈 공백"은 즉시 차단
     */
    attractionId: string

    /**
     * isFavorite
     * - 상위 데이터(React Query 캐시/서버 응답)가 판단한 "현재 즐겨찾기 최종 상태"
     * - 이 컴포넌트는 이 값을 기반으로 로컬 옵티미스틱 상태를 초기화하며 최종 일관성을 보장
     */
    isFavorite: boolean
}

/**
 * FAVORITE_TOGGLE_LOCK_TIMEOUT_MS
 *
 * 역할/목적:
 * - 빠른 연타/중복 클릭을 막기 위한 "로컬 잠금"의 최대 자동 해제 시간 제한
 *
 * 배경:
 * - 서버 요청이 지연되거나 네트워크가 불안정할 때 사용자가 반복 클릭을 하면
 *   동일 명령(add/remove)이 중복으로 발행되어 서버 부하/경합/오류 가능성이 커짐
 *
 * 정책:
 * - 일반적으로는 mutation의 onSettled에서 잠금을 해제하지만,
 *   최악의 경우(응답 지연/이벤트 누락 등)에도 잠금이 영구 잠금되지 않도록 자동 해제 타이머를 설정
 */
const FAVORITE_TOGGLE_LOCK_TIMEOUT_MS = 15_000

/**
 * FavoriteButton 컨테이너 컴포넌트.
 *
 * - 즐겨찾기 토글 UX 정책(인증 확인, 옵티미스틱 업데이트, 중복 클릭 차단, 실패 롤백, 피드백)을 처리
 * - 실제 버튼 UI 렌더링은 FavoriteToggleButton에 위임
 */
export function FavoriteButton({ attractionId, isFavorite }: FavoriteButtonProps) {
    /**
     * normalizedAttractionId
     *
     * 목적:
     * - 식별자 입력의 공백/오류값을 방어하기 위한 1차 정규화
     *
     * 정책:
     * - 상위 컨텍스트 요청 경로에서도 trim된 값만 사용하여 입력 흔들림 최소화
     */
    const normalizedAttractionId = attractionId.trim()

    /**
     * user
     * - 인증 상태로 UX 흐름 제어에 활용
     * - 최종 권한/인증 판정은 서버가 강제한다는 전제로 사용
     */
    const { user } = authModel.useAuth()

    /**
     * useFavoriteToggle
     * - 서버 명령(add/remove)을 실행하고, React Query 캐시를 업데이트/무효화 정책으로 수렴시키는 도메인 훅
     *
     * isPending:
     * - 현재 mutation이 진행 중인지 나타내는 상태(네트워크/서버 처리 포함)
     * - UX 관점에서 중복 요청 차단 용도로 활용
     */
    const { mutate, isPending } = useFavoriteToggle(normalizedAttractionId)

    /**
     * optimisticFavorite
     *
     * 역할/목적:
     * - 버튼 클릭 즉시 UI가 반응하도록 "옵티미스틱 업데이트"를 위한 로컬 상태
     *
     * 정책:
     * - 서버 응답이 실패하면 onError에서 이전 값으로 롤백
     * - 서버/캐시 기반 최종 값(isFavorite)이 바뀌면 effect로 즉시 맞춰 최종 일관성 유지
     */
    const [optimisticFavorite, setOptimisticFavorite] = useState<boolean>(isFavorite)

    /**
     * clickLockRef
     *
     * 역할/목적:
     * - isPending과 별개로 "빠른 연타/중복 클릭"을 차단하기 위한 로컬 잠금 플래그
     *
     * 배경:
     * - UI 이벤트는 매우 빠르게 반복될 수 있으므로,
     *   네트워크 상태 갱신(isPending)이 반영되기 이전의 짧은 구간에서 중복 호출이 발생 가능
     */
    const clickLockRef = useRef<boolean>(false)

    /**
     * lockTimeoutRef
     *
     * 역할:
     * - 로컬 잠금 자동 해제를 위한 타이머 핸들
     *
     * 정책:
     * - 잠금이 걸릴 때마다 이전 타이머를 제거하고 새 타이머 등록
     */
    const lockTimeoutRef = useRef<number | null>(null)

    /**
     * isMountedRef
     *
     * 역할/목적:
     * - 언마운트 이후 비동기 콜백(onError/onSettled 등)에서
     *   setState/toast 호출이 발생하지 않도록 보호하는 안전장치
     *
     * 배경:
     * - 라우터 전환/리스트 렌더링 조건부 제어 등으로 컴포넌트가 빠르게 unmount
     */
    const isMountedRef = useRef<boolean>(true)

    /**
     * 최종 상태 동기화
     *
     * 목적:
     * - 상위에서 내려온 isFavorite(서버/캐시 기반 최종 값)이 바뀌면
     *   로컬 옵티미스틱 상태를 해당 값으로 즉시 동기화하여 최종 일관성으로 수렴
     *
     * 설계 포인트:
     * - 옵티미스틱 업데이트는 "즉시 반응"을 위한 전략이고,
     *   최종 일관성은 "서버/캐시"를 기반으로 한다는 정책이 명확
     */
    useEffect(() => {
        setOptimisticFavorite(isFavorite)
    }, [isFavorite])

    /**
     * clearLockTimeout / releaseClickLock / acquireClickLock
     *
     * 목적:
     * - 로컬 잠금(clickLockRef)을 안전한 방식으로 제어하기 위한 유틸리티 함수
     *
     * 동작:
     * - acquire: 잠금을 걸고 타이머로 자동 해제를 예약
     * - release: 타이머를 제거한 후 잠금을 해제
     */
    const clearLockTimeout = () => {
        if (lockTimeoutRef.current === null) return
        window.clearTimeout(lockTimeoutRef.current)
        lockTimeoutRef.current = null
    }

    const releaseClickLock = () => {
        clearLockTimeout()
        clickLockRef.current = false
    }

    const acquireClickLock = () => {
        clearLockTimeout()
        clickLockRef.current = true
        lockTimeoutRef.current = window.setTimeout(() => {
            clickLockRef.current = false
            lockTimeoutRef.current = null
        }, FAVORITE_TOGGLE_LOCK_TIMEOUT_MS)
    }

    /**
     * 라이프사이클 처리
     *
     * 목적:
     * - 언마운트 시:
     *   - isMountedRef를 false로 내려 비동기 콜백의 UI 업데이트 차단
     *   - 잠금 타이머를 제거하여 불필요한 콜백 실행 방지
     */
    useEffect(() => {
        isMountedRef.current = true

        return () => {
            isMountedRef.current = false
            if (lockTimeoutRef.current !== null) {
                window.clearTimeout(lockTimeoutRef.current)
                lockTimeoutRef.current = null
            }
            clickLockRef.current = false
        }
    }, [])

    /**
     * handleToggle
     *
     * 역할/목적:
     * - 즐겨찾기 토글의 단일 진입점
     *
     * 정책(검증 순서):
     * 1) 식별자 유효성 방어
     * 2) 인증 여부 정책(로그인 필요)
     * 3) 중복 호출 차단(isPending + clickLock)
     * 4) 옵티미스틱 업데이트로 즉시 UI 반영
     * 5) 서버 명령 실행, 실패 시 롤백, 완료 시 잠금 해제
     *
     * 사용자 피드백:
     * - 실패 시 에러 메시지를 추출(getErrorMessage)하여 토스트로 안내
     * - isPending + clickLock으로 이중 잠금을 사용하여 중복 호출 방지
     */
    const handleToggle = () => {
        if (!normalizedAttractionId) {
            toast.error("관광지 식별자가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요.")
            return
        }
        if (!user) {
            toast.error("로그인 후 즐겨찾기를 이용할 수 있습니다.")
            return
        }

        // isPending: mutation 진행 중 차단 / clickLockRef: 빠른 연타 및 비정상 지연 구간 차단
        if (isPending || clickLockRef.current) return

        const prevFavorite = optimisticFavorite
        const nextFavorite = !prevFavorite

        setOptimisticFavorite(nextFavorite)
        acquireClickLock()

        mutate(
            { nextFavorite },
            {
                onError: (error) => {
                    if (isMountedRef.current) {
                        setOptimisticFavorite(prevFavorite)
                    }

                    const message = getErrorMessage(
                        error,
                        "즐겨찾기 처리에 실패했습니다. 다시 한번 시도해 주세요.",
                    )
                    if (isMountedRef.current) {
                        toast.error(message)
                    }
                },
                onSettled: () => {
                    releaseClickLock()
                },
            }
        )
    }

    /**
     * 렌더링
     *
     * 목적:
     * - 표현 컴포넌트(FavoriteToggleButton)에 필요한 최소 상태/핸들러만 전달
     *
     * 전달 정책:
     * - isFavorite: 로컬 옵티미스틱 상태(즉시 반응)
     * - isPending: 서버 처리 진행 신호(스피너/비활성화 표현에 활용)
     * - disabled: 식별자 무효 시 호출 차단 신호
     */
    return (
        <FavoriteToggleButton
            isFavorite={optimisticFavorite}
            isPending={isPending}
            disabled={!normalizedAttractionId}
            onToggle={handleToggle}
        />
    )
}