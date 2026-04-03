package pnu.busan.walker.auth.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import pnu.busan.walker.auth.domain.RefreshToken;
import pnu.busan.walker.user.domain.User;

/**
 * RefreshToken Repository
 *
 * 운용 정책(요약)
 * - 서버는 refresh token 원문을 저장하지 않고 해시(token_hash)만 저장
 * - 회전 시 consumed_at 업데이트로 1회성 사용을 보장
 * - 재사용 탐지 시 동일 jti(세션 패밀리) 전체를 revoked_at으로 폐기
 *
 * 설계 포인트
 * - update 쿼리는 int(영향 row 수) 반환으로 동시성 경쟁을 탐지/제어
 * - revokeFamily는 jti 단위로 "모든 토큰"을 폐기하여 세션 전체를 강제 종료
 */
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

	/* =====================================================================
	   Read
	   ===================================================================== */
	/**
	 * [해시로 단건 조회]
	 * - token_hash는 유니크(uk_rt_token_hash)
	 * - 존재하지 않으면 위조/만료/정리된 토큰일 수 있음
	 */
	@Query(
			value = """
					SELECT *
					FROM refresh_tokens
					WHERE token_hash = :hash
					LIMIT 1
					""",
			nativeQuery = true
	)
	Optional<RefreshToken> findByTokenHash(@Param("hash") byte[] hash);

	/**
	 * [Refresh 전용 조회: RefreshToken + User를 함께 로딩]
	 *
	 * 목적
	 * - RefreshToken.user가 LAZY 프록시인 상태에서
	 *   consume() 이후(detach/clear 등) user 접근 시 LazyInitializationException을 방지
	 *
	 * 동작
	 * - refresh token 해시로 RefreshToken을 찾고, 연관된 User를 fetch join으로 즉시 로딩
	 */
	@Query(
			value = """
					SELECT rt
					FROM RefreshToken rt
					JOIN FETCH rt.user
					WHERE rt.tokenHash = :hash
					"""
	)
	Optional<RefreshToken> findByTokenHashWithUser(@Param("hash") byte[] hash);

	/* =====================================================================
	   Write (회전/폐기)
	   ===================================================================== */

	/**
	 * [동일 세션(jti) 전체 폐기]
	 *
	 * 동작
	 * - revokedAt이 NULL인 토큰만 now로 업데이트
	 * - 이미 폐기된 토큰은 중복 업데이트하지 않음
	 */
	@Transactional
	@Modifying(flushAutomatically = true)
	@Query(
			value = """
					UPDATE RefreshToken r
					SET r.revokedAt = :now
					WHERE r.jti = :jti
					AND r.revokedAt IS NULL
					"""
	)
	int revokeFamily(@Param("jti") byte[] jti, @Param("now") Instant now);

	/**
	 * [현재 토큰 소비 처리(회전)]
	 *
	 * 조건
	 * - consumedAt IS NULL : 아직 회전/사용 완료되지 않음
	 * - revokedAt IS NULL  : 강제 폐기되지 않음
	 *
	 * 반환
	 * - 1: 정상 소비
	 * - 0: 이미 소비/폐기되었거나 다른 요청이 먼저 소비했을 수 있음(동시성 경쟁)
	 *
	 * 중요:
	 * - clearAutomatically=true는 영속성 컨텍스트를 비워(detach) 버림
	 *   refresh 흐름에서 User(LAZY 프록시) 접근이 남아있으면 LazyInitializationException이 발생할 수 있으므로 제거
	 */
	@Transactional
	@Modifying(flushAutomatically = true)
	@Query(
			value = """
					UPDATE RefreshToken r
					SET r.consumedAt = :now
					WHERE r.id = :id
					AND r.consumedAt IS NULL
					AND r.revokedAt IS NULL
					"""
	)
	int consume(@Param("id") Long id, @Param("now") Instant now);

	/**
	 * [특정 사용자 모든 세션 강제 종료]
	 *
	 * 사용 시나리오
	 * - 비밀번호 변경/재설정
	 * - 계정 비활성화/보안 사고 대응
	 *
	 * 조건
	 * - 아직 소비되지 않은(consumedAt IS NULL) 토큰 중 폐기되지 않은(revokedAt IS NULL) 토큰만 폐기
	 */
	@Transactional
	@Modifying(flushAutomatically = true)
	@Query(
			value = """
					UPDATE RefreshToken r
					SET r.revokedAt = :now
					WHERE r.user = :user
					AND r.consumedAt IS NULL
					AND r.revokedAt IS NULL
					"""
	)
	int revokeAllByUser(@Param("user") User user, @Param("now") Instant now);

}