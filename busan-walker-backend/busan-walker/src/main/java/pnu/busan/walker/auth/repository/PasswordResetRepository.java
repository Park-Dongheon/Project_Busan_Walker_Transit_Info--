package pnu.busan.walker.auth.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import pnu.busan.walker.auth.domain.PasswordReset;
import pnu.busan.walker.user.domain.User;

import java.time.Instant;
import java.util.Optional;

/**
 * PasswordReset(비밀번호 재설정 토큰) Repository
 * 
 * 목적
 * - "조회(검증/쿨다운) -> 상태 변경(소비/무효화) -> 정리(청소)" 수명주기 지원
 *
 * 설계 포인트
 * - Read: Optional 반환으로 "없음"을 자연스럽게 표현
 * - Write: int 반환으로 동시성 경쟁 상황에서 안전하게 처리
 */
public interface PasswordResetRepository extends JpaRepository<PasswordReset, Long> {

	/* =====================================================================
	   Read (조회 / 검증 / 쿨다운)
	   ===================================================================== */
	
	/**
	 * [토큰 검증용 조회]
	 * 사용자(user)와 토큰 해시(tokenHash)가 정확히 일치하는 PasswordReset 레코드를 조회
	 * 
	 * 사용 시나리오
	 * - 사용자가 이메일 링크를 클릭하여 "토큰 확정(confirm)" API 호출 시:
	 *   1) 전달받은 원문 토큰을 해시로 변환
	 *   2) user + tokenHash로 레코드 조회
	 *   3) 존재 여부/만료 여부/사용 여부를 서비스 계층에서 검증
	 * 
	 * 반환
	 * - Optional.empty(): 해당 조합의 토큰이 존재하지 않음(위조/오입력/이미 정리됨)
	 */
	@Query("""
			SELECT p
			  FROM PasswordReset p
			 WHERE p.user = :user
			   AND p.tokenHash = :hash
			""")
	Optional<PasswordReset> findByUserAndTokenHash(@Param("user") User user, @Param("hash") byte[] hash);
	
	/**
	 * [쿨다운(발급 빈도 제한) 조회]
	 * 특정 사용자에 대해 "현재 시점(now) 기준으로 활성 상태"인 토큰 중
	 * 가장 최근(createAt DESC) 토큰 1건을 조회
	 * 
	 * 활성(Active) 조건
	 * - consumedAt IS NULL : 아직 사용(소비)되지 않음
	 * - expiresAt > now	: 아직 만료되지 않음
	 * 
	 * 사용 시나리오
	 * - "비밀번호 재설정 이메일 다시 보내기" 같은 기능에서:
	 *   최근 발급 시간이 너무 가까우면 재발급을 제한(쿨다운)하기 위해 사용
	 * 
	 * 참고
	 * - ORDER BY는 최신 1건을 고르기 위함이며, 실제 쿨다운 시간 판단(예: createdAt + N분)은
	 *   서비스 계층에서 정책으로 처리하는 편이 유연
	 */
	Optional<PasswordReset> findFirstByUserAndConsumedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(User user, Instant now);

	/* =====================================================================
	   Write (상태 변경 / 소비 / 무효화)
	   ===================================================================== */
	
	/**
	 * [토큰 소비(1회성 사용 처리)]
	 * 특정 PasswordReset 레코드(id)에 대해 consumedAt을 now로 설정하여 "사용됨" 상태로 만듦
	 *
	 * 동시성 안전장치
	 * - WHERE consumedAt IS NULL 조건을 포함하여,
	 *   이미 다른 요청이 먼저 소비했다면 업데이트가 적용되지 않게 함
	 * 
	 * 반환값 의미
	 * - 1: 정상적으로 소비 처리됨
	 * - 0: 이미 소비되었거나(id가 없거나) 조건 불만족으로 변경되지 않음
	 * 
	 * 사용 시나리오
	 * - 토큰 검증 완료 후, 비밀번호 변경을 성공적으로 수행한 다음 소비 처리
	 */
	@Transactional
	@Modifying
	@Query("""
			UPDATE PasswordReset p
			   SET p.consumedAt = :now
			 WHERE p.id = :id
			   AND p.consumedAt IS NULL
			""")
	int consume(@Param("id") Long id, @Param("now") Instant now);
	
	/**
	 * [사용자 기준 활성 토큰 일괄 무효화]
	 * 특정 사용자(user)가 보유한 "현재 시점(now) 기준 활성 토큰"들을 모두 consumedAt=now로 설정
	 * 
	 * 목적
	 * - "최신 링크만 유효" 정책 구현:
	 *   새 토큰을 발급할 때 기존 활성 토큰을 모두 무효화하여, 이전 링크 재사용을 막음
	 * 
	 * 활성(Active) 조건
	 * - consumedAt IS NULL : 아직 사용되지 않음
	 * - expiresAt > now	: 아직 만료되지 않음
	 * 
	 * 반환값 의미
	 * - 무효화(업데이트)된 토큰 개수
	 * 
	 * 사용 시나리오
	 * - 새 비밀번호 재설정 토큰을 생성/저장하기 직전에 호출하여 이전 토큰들을 정리
	 */
	@Transactional
	@Modifying
	@Query("""
			UPDATE PasswordReset p
			   SET p.consumedAt = :now
			 WHERE p.user = :user
			   AND p.consumedAt IS NULL
			   AND p.expiresAt > :now
			""")
	int invalidateAllActiveByUser(@Param("user") User user, @Param("now") Instant now);

	/* =====================================================================
	   Maintenance (정리 / 청소)
	   ===================================================================== */
	
	/**
	 * [토큰 정리[청소]]
	 * 다음 조건에 해당하는 레코드를 삭제
	 * - expiresAt < now		: 만료된 토큰
	 * - consumedAt IS NOT NULL	: 이미 사용(소비)된 토큰
	 * 
	 * 목적
	 * - 테이블 크기 증가 방지, 인덱스 부담 완화, 운영 성능 안정화
	 * 
	 * 반환값 의미
	 * - 삭제된 레코드 개수
	 * 
	 * 사용 시나리오
	 * - 스케줄러/배치 작업에서 주기적으로 호출
	 * - 또는 토큰 발급/확정 시점에 "가볍게" 호출
	 */
	@Transactional
	@Modifying
	@Query("""
			DELETE FROM PasswordReset p
				  WHERE p.expiresAt < :now
				  	 OR p.consumedAt IS NOT NULL
			""")
	int cleanup(@Param("now") Instant now);

}
