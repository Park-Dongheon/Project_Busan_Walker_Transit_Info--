package pnu.busan.walker.auth.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import pnu.busan.walker.auth.domain.EmailVerification;
import pnu.busan.walker.auth.domain.EmailVerificationPurpose;
import pnu.busan.walker.user.domain.User;

import java.time.Instant;
import java.util.Optional;

/**
 * 이메일 인증 토큰 Repository
 *
 * 책임 범위
 * - 조회(검증): user + token_hash(+purpose)로 단건 조회
 * - 상태 변경(소비): consumed_at 업데이트로 1회성 보장
 * - 무효화(일괄 소비): "최신 링크만 유효" 정책 지원
 * - 정리(청소): 만료/소비 토큰 삭제
 *
 * 설계 포인트
 * - 상태 변경(update)은 int(영향 row 수) 반환으로 동시성 경쟁 상황에 안전
 * - purpose를 조건으로 포함하면 인증 목적 혼재 시에도 로직이 안정
 */
public interface EmailVerificationRepository extends JpaRepository<EmailVerification, Long> {

	/* =====================================================================
	   Read (조회 / 검증 / 쿨다운)
	   ===================================================================== */

	/**
	 * [토큰 검증용 단건 조회]
	 *
	 * 조회 기준
	 * - user		: 토큰 소유 사용자
	 * - hash		: SHA-256(token raw) 결과 (BINARY(32))
	 * - purpose	: 토큰 목적 구분(SIGNUP/CHANGE_EMAIL/CHANGE_PASSWORD)
	 *
	 * 반환
	 * - Optional.empty(): 해당 조합의 토큰이 존재하지 않음(위조/오입력/정리됨)
	 */
	@Query("""
			SELECT e
			  FROM EmailVerification e
			 WHERE e.user = :user
			   AND e.tokenHash = :hash
			   AND e.purpose = :purpose
			""")
	Optional<EmailVerification> findByUserAndTokenHashAndPurpose(
			@Param("user") User user,
			@Param("hash") byte[] hash,
			@Param("purpose") EmailVerificationPurpose purpose
	);

	/**
	 * [최근 발급 이력 조회(쿨다운)]
	 * - 사용자 + 목적 기준으로 "가장 최근 발급 1건"을 조회
	 * - ID 역순 정렬(자동 증가 PK)로 최신성 확보
	 */
	Optional<EmailVerification> findTopByUserAndPurposeOrderByIdDesc(User user, EmailVerificationPurpose purpose);

	/* =====================================================================
	   Write (상태 변경 / 소비 / 무효화)
	   ===================================================================== */

	/**
	 * [토큰 소비(1회성 사용 처리)]
	 *
	 * 동작
	 * - consumedAt이 NULL인 경우에만 now로 업데이트
	 *
	 * 반환
	 * - 1: 정상 소비
	 * - 0: 이미 소비되었거나(id 없음) 변경되지 않음
	 */
	@Transactional
	@Modifying
	@Query("""
			UPDATE EmailVerification e
			   SET e.consumedAt = :now
			 WHERE e.id = :id
			   AND e.consumedAt IS NULL
			   AND e.expiresAt > :now
			""")
	int consume(@Param("id") Long id, @Param("now") Instant now);

	/**
	 * [사용자 기준 활성 토큰 일괄 무효화]
	 *
	 * 활성 조건
	 * - purpose 동일
	 * - consumedAt IS NULL
	 * - expiresAt > now
	 *
	 * 목적
	 * - "최신 링크만 유효" 정책 구현
	 */
	@Transactional
	@Modifying
	@Query("""
			UPDATE EmailVerification e
			   SET e.consumedAt = :now
			 WHERE e.user = :user
			   AND e.purpose = :purpose
			   AND e.consumedAt IS NULL
			   AND e.expiresAt > :now
			""")
	int consumeAllActiveByUserAndPurpose(
			@Param("user") User user,
			@Param("purpose") EmailVerificationPurpose purpose,
			@Param("now") Instant now
	);

	/* =====================================================================
	   Maintenance (정리 / 청소)
	   ===================================================================== */

	/**
	 * [만료/소비 토큰 청소]
	 *
	 * 삭제 조건
	 * - expiresAt < now		: 만료 토큰
	 * - consumedAt IS NOT NULL : 이미 사용된 토큰
	 *
	 * 반환
	 * - 삭제된 레코드 수
	 */
	@Transactional
	@Modifying
	@Query("""
			DELETE FROM EmailVerification e
				  WHERE e.expiresAt < :now
				     OR e.consumedAt IS NOT NULL
			""")
	int cleanup(@Param("now") Instant now);
	
}
