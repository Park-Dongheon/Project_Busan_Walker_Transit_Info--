package pnu.busan.walker.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pnu.busan.walker.auth.config.JwtProperties;
import pnu.busan.walker.auth.domain.RefreshToken;
import pnu.busan.walker.auth.dto.*;
import pnu.busan.walker.auth.jwt.JwtIssuer;
import pnu.busan.walker.auth.repository.RefreshTokenRepository;
import pnu.busan.walker.auth.support.CryptoUtils;
import pnu.busan.walker.auth.support.EmailAddressNormalizer;
import pnu.busan.walker.common.domain.Role;
import pnu.busan.walker.common.error.exception.ConflictException;
import pnu.busan.walker.common.error.exception.ReusedRefreshTokenException;
import pnu.busan.walker.common.error.exception.TokenExpiredException;
import pnu.busan.walker.common.error.exception.UnauthorizedException;
import pnu.busan.walker.user.domain.AccountStatus;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.repository.UserRepository;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * 인증 서비스
 *
 * 책임:
 * - 회원가입, 로그인, 로그아웃, 리프레시 토큰 회전
 * - 리프레시 토큰 해시 저장 및 재사용 탐지
 * - 토큰 재사용/충돌 시 토큰 패밀리(JTI) 단위 폐기
 */
@Service
@RequiredArgsConstructor
public class AuthService {

	private static final int USER_AGENT_MAX_LENGTH = 255;

	private final UserRepository userRepo;
	private final RefreshTokenRepository refreshTokenRepo;
	private final EmailVerificationService emailVerificationService;
	private final PasswordEncoder passwordEncoder;
	private final JwtIssuer jwtIssuer;
	private final JwtProperties props;
	private final Clock clock;

	/* ============================================================
	 * 회원가입
	 * ============================================================ */

	@Transactional
	public void register(RegisterRequest request) {
		String email = EmailAddressNormalizer.normalize(request.email());
		String passwordHash = passwordEncoder.encode(request.password());
		String displayName = request.displayName().trim();

		/* 1) 이메일 중복 체크 */
		if (userRepo.existsByEmail(email)) {
			throw new ConflictException("이미 사용 중인 이메일입니다.");
		}

		/* 2) User 엔티티 생성 */
		User u = User.builder()
				.email(email)
				.passwordHash(passwordHash)
				.displayName(displayName)
				.role(Role.MEMBER)		// 기본 회원 권한
				.active(false)
				.build();

		try {
			userRepo.save(u);
		} catch (DataIntegrityViolationException e ) {
			throw new ConflictException("이미 사용 중인 이메일입니다.");
		}

		/* 3) 이메일 인증 토큰 발급 (메일 발송 포함) */
		emailVerificationService.issueForUser(u);
	}

	/* ============================================================
	 * 로그인
	 * ============================================================ */

	/**
	 * 이메일/비밀번호 로그인
	 *
	 * 참고:
	 * - refresh token은 응답 바디로 노출하지 않고 HttpOnly 쿠키로만 발급
	 * - 컨트롤러에서 Set-Cookie를 만들 수 있도록 TokenPair(raw refreshToken 포함) 전달
	 */
	@Transactional
	public LoginResult login(LoginRequest request, byte[] ip, String userAgent) {
		String normalizedEmail = EmailAddressNormalizer.normalize(request.email());

		/* 1) 사용자 조회 */
		User user = userRepo.findByEmail(normalizedEmail)
				.orElseThrow(() -> new UnauthorizedException("Invalid credentials."));

		/* 2) 비밀번호 검증 */
		if (user.getPasswordHash() == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
			throw new UnauthorizedException("Invalid credentials.");
		}

		/* 3) 이메일 인증 여부 */
		if (user.getEmailVerifiedAt() == null) {
			throw new UnauthorizedException("Email verification required.");
		}

		/* 4) 계정 상태 처리 */
		if (!user.isLoginEnabled()) {
			if (user.getStatus() == AccountStatus.DISABLED_BY_USER) {
				// Self-disabled accounts recover on the next successful login.
				user.reactivate();
			} else {
				throw new UnauthorizedException("Account inactive.");
			}
		}

		/* 5) 세션(JTI) 생성 후 토큰 페어 발급 */
		UUID jti = UUID.randomUUID();
		TokenPair pair = issuePair(user, jti, ip, userAgent);

		return new LoginResult(
				user.getId(),
				user.getEmail(),
				user.getDisplayName(),
				user.getRole().name(),
				pair
		);
	}

	/* ============================================================
	 * Refresh Token 회전(갱신)
	 * ============================================================ */

	/**
	 * Refresh token 회전(갱신)
	 *
	 * 설계 의도:
	 * - 브라우저는 refresh를 HttpOnly 쿠키로만 보관
	 * - access 만료(401) 시 refresh endpoint로 access 재발급
	 *
	 * 실패 모델:
	 * - consumed된 refresh token 재사용 감지 시 동일 JTI 패밀리 전체 revoke
	 */
	@Transactional(noRollbackFor = ReusedRefreshTokenException.class)
	public TokenPair refresh(RefreshRequest request, byte[] ip, String userAgent) {
		/* 1) 요청 refreshToken 해시 변환 */
		byte[] hash = CryptoUtils.sha256OfB64Url132OrNull(request.refreshToken());
		if (hash == null) {
			throw new UnauthorizedException("Invalid refresh token.");
		}

		/*
		  주의:
		  - refresh 흐름에서 RefreshToken.user를 반드시 fetch join으로 함께 로딩
		  - 이유: consume(조건부 업데이트) 이후 User가 detach되면,
		    issuePair() 호출 시 LazyInitializationException 위험이 있음
		 */
		RefreshToken rt = refreshTokenRepo.findByTokenHashWithUser(hash).orElseThrow(() -> new UnauthorizedException("유효하지 않은 리프레시 토큰입니다."));

		Instant now = clock.instant();

		/* 2) revoked 여부 */
		if (rt.getRevokedAt() != null) {
			throw new UnauthorizedException("Refresh token revoked.");
		}

		/* 3) 만료 여부 */
		if (rt.getExpiresAt() != null && !rt.getExpiresAt().isAfter(now)) {
			throw new TokenExpiredException("리프레시 토큰이 만료되었습니다.");
		}

		/* 4) 재사용 감지: consumed 상태면 패밀리(JTI) 폐기 */
		if (rt.getConsumedAt() != null) {
			refreshTokenRepo.revokeFamily(rt.getJti(), now);
			throw new ReusedRefreshTokenException("Reused/consumed token");
		}

		/* 5) 세션(JTI) 정보 */
		UUID sessionJti = toUuid(rt.getJti());
		if (sessionJti == null) {
			revokeFamily(rt.getJti(), now);
			throw new UnauthorizedException("Invalid refresh token.");
		}

		User tokenOwner = rt.getUser();
		validateRefreshOwner(tokenOwner, rt.getJti(), now);

		/* 6) consume 원자 처리 (동시성 경합 방지) */
		int consumed = refreshTokenRepo.consume(rt.getId(), now);
		if (consumed != 1) {
			/* 다른 요청이 먼저 consume 했을 가능성 -> 보안 이벤트로 처리 */
			refreshTokenRepo.revokeFamily(rt.getJti(), now);
			throw new ReusedRefreshTokenException("동시 갱신 충돌이 감지되었습니다.");
		}

		/* 7) fetch join으로 로딩한 완전한 User로 다음 토큰 발급 */
		return issuePair(tokenOwner, sessionJti, ip, userAgent);
	}

	/* ============================================================
	 * 로그아웃
	 * ============================================================ */

	@Transactional
	public void logout(LogoutRequest request) {
		byte[] hash = CryptoUtils.sha256OfB64Url132OrNull(request.refreshToken());
		if (hash == null) {
			return;
		}

		refreshTokenRepo.findByTokenHash(hash).ifPresent(rt -> {
			Instant now = clock.instant();
			refreshTokenRepo.revokeFamily(rt.getJti(), now);
		});

	}

	/* ============================================================
	 * 내부 유틸 메서드
	 * ============================================================ */

	private TokenPair issuePair(User u, UUID jti, byte[] ip, String userAgent) {
		Instant now = Instant.now(clock);

		/* Access 토큰 발급 */
		String at = jwtIssuer.issueAccessToken(u.getId(), u.getEmail(), u.getRole().name());

		/* Refresh 토큰: 원문 32B -> B64URL, DB에는 SHA-256 해시만 저장 */
		String rtRaw = CryptoUtils.randomB64Url32();
		byte[] hash = CryptoUtils.sha256OfB64Url132OrNull(rtRaw);

		/* refresh 만료 시각은 서버 기준으로 계산 */
		Instant refreshExpiresAt = now.plus(props.getRefreshTtl());

		RefreshToken entry = RefreshToken.builder()
				.user(u)
				.jti(fromUuid(jti))
				.tokenHash(hash)
				.issuedAt(now)
				.expiresAt(refreshExpiresAt)
				.ipAddress(ip)
				.userAgent(sanitizeUserAgent(userAgent))
				.build();

		refreshTokenRepo.save(entry);

		return new TokenPair(at, rtRaw, refreshExpiresAt.toEpochMilli());
	}

	private void validateRefreshOwner(User user, byte[] familyJti, Instant now) {
		if (user.getEmailVerifiedAt() == null) {
			revokeFamily(familyJti, now);
			throw new UnauthorizedException("Email verification required.");
		}
		if (!user.isLoginEnabled()) {
			revokeFamily(familyJti, now);
			throw new UnauthorizedException("Account inactive.");
		}
	}

	private void revokeFamily(byte[] familyJti, Instant now) {
		if (familyJti != null && familyJti.length > 0) {
			refreshTokenRepo.revokeFamily(familyJti, now);
		}
	}

	private static String sanitizeUserAgent(String userAgent) {
		if (userAgent == null) {
			return null;
		}

		String normalized = userAgent.trim();
		if (normalized.isEmpty()) {
			return null;
		}
		if (normalized.length() <= USER_AGENT_MAX_LENGTH) {
			return normalized;
		}
		return normalized.substring(0, USER_AGENT_MAX_LENGTH);
	}

	private static byte[] fromUuid(UUID jti) {
		long msb = jti.getMostSignificantBits();
		long lsb = jti.getLeastSignificantBits();
		byte[] out = new byte[16];

		for (int i = 7; i >= 0; i--) {
			out[i] = (byte) (msb & 0xff);
			msb >>>= 8;
		}
		for (int i = 15; i >= 8; i--) {
			out[i] = (byte) (lsb & 0xff);
			lsb >>>= 8;
		}

		return out;
	}

	private static UUID toUuid(byte[] jti) {
		if (jti == null || jti.length != 16) {
			return null;
		}

		long msb = 0L;
		long lsb = 0L;

		for (int i = 0; i < 8; i++) {
			msb = (msb << 8) | (jti[i] & 0xff);
		}
		for (int i = 8; i < 16; i++) {
			lsb = (lsb << 8 ) | (jti[i] & 0xff);
		}

		return new UUID(msb, lsb);
	}

}

