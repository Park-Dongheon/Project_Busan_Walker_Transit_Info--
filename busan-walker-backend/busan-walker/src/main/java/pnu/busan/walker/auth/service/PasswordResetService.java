package pnu.busan.walker.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pnu.busan.walker.auth.domain.PasswordReset;
import pnu.busan.walker.auth.dto.PasswordResetConfirmRequest;
import pnu.busan.walker.auth.dto.PasswordResetRequest;
import pnu.busan.walker.auth.repository.PasswordResetRepository;
import pnu.busan.walker.auth.repository.RefreshTokenRepository;
import pnu.busan.walker.auth.support.CryptoUtils;
import pnu.busan.walker.auth.support.EmailAddressNormalizer;
import pnu.busan.walker.common.error.exception.BadRequestException;
import pnu.busan.walker.common.error.exception.NotFoundException;
import pnu.busan.walker.common.error.exception.UnauthorizedException;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.repository.UserRepository;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;

/**
 * 비밀번호 재설정(1회용)
 *
 * 제공 기능
 * - 재설정 토큰 발급(issue): 쿨다운 검사 -> 기존 활성 토큰 무효화 -> 새 토큰 저장 -> 메일 발송
 * - 확정(confirm): 토큰 검증/만료 검사 -> 비밀번호 변경 -> 토큰 소비 -> 모든 refresh 세션 폐기
 *
 * 보안 모델
 * - 토큰 원문은 절대 DB에 저장하지 않고, 메일 링크로만 전달
 * - 서버는 SHA-256 해시만 저장
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {
	
	private final UserRepository userRepo;
	private final PasswordResetRepository passwordResetRepo;
	private final PasswordEncoder encoder;
	private final RefreshTokenRepository refreshTokenRepo;
	private final MailService mailService;
	private final Clock clock;
	
	/* 재설정 메일 재요청 쿨다운(초) */
	private static final long RESET_COOLDOWN_SECONDS = 60L;
	
	@Value("${app.frontend-base-url}")
	private String frontendBaseUrl;
	
	/**
	 * 재설정 토큰 발급
	 *
	 * 흐름
	 * 1) email로 user 조회
	 * 2) 쿨다운(최근 발급 이력) 검사
	 * 3) 기존 활성 토큰 무효화(최신 링크만 유효)
	 * 4) raw 토큰 생성 + 해시 저장
	 * 5) 프론트 reset URL 생성 + 메일 발송
	 */
	@Transactional
	public void issue(PasswordResetRequest request) {
		String normalizedEmail = EmailAddressNormalizer.normalize(request.email());

		/* 1) 이메일로 사용자 조회 - 존재하지 않으면 예외를 던져 프론트에 "존재하지 않는 이메일" 메시지 전달 */
		User u = userRepo.findByEmail(normalizedEmail).orElseThrow(() -> new NotFoundException("해당 이메일 계정을 찾을 수 없습니다."));
		
		Instant now = Instant.now(clock);
		Instant exp = now.plusSeconds(30 * 60);			// 30분 유효
		
		/* 2) 최근 발급 이력 확인하여 너무 자주 요청하는 경우 차단 (쿨다운) */
		passwordResetRepo.findFirstByUserAndConsumedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(u, now)
				.ifPresent(latest -> {
					Instant createdAt = latest.getCreatedAt();
					if (createdAt != null && createdAt.isAfter(now.minusSeconds(RESET_COOLDOWN_SECONDS))) {
						throw new BadRequestException("이미 비밀번호 재설정 메일을 보냈습니다. 잠시 후 다시 요청해 주세요.");
					}
				});
		
		/* 3) 기존 활성 토큰은 모두 무효화 → "최신 링크만 유효" 정책 */
		int invalidated = passwordResetRepo.invalidateAllActiveByUser(u, now);
		log.debug("invalidateAllActiveByUser userId={}, count={}", u.getId(), invalidated);
		
		/* 4) 1회용 토큰 생성 (원문은 B64URL 문자열, DB에는 SHA-256 해시만 저장) */
		String raw = CryptoUtils.randomB64Url32();		// 토큰 원문
		byte[] hash = CryptoUtils.sha256OfB64Url132OrNull(raw);	// 토큰 해시
		
		PasswordReset pr = PasswordReset.builder()
				.user(u)
				.tokenHash(hash)
				.expiresAt(exp)
				.build();
		
		passwordResetRepo.save(pr);
		
		/* 5) 비밀번호 재설정 링크 구성 */
		String resetUrl = String.format(
				"%s/auth/password/reset?email=%s&token=%s",
				frontendBaseUrl,
				URLEncoder.encode(u.getEmail(), StandardCharsets.UTF_8),
				raw
		);
		
		/* 6) 재설정 메일 발송 */
		try {
			mailService.sendPasswordReset(u.getEmail(), resetUrl);
			log.info("Password reset mail send. email={}", u.getEmail());
		} catch (MailException e) {
			log.error("비밀번호 재설정 메일 전송 실패. email={}, reason={}", u.getEmail(), e.getMessage());
			throw new IllegalStateException("비밀번호 재설정 메일 발송 중 오류가 발생했습니다.", e);
		}
		
	}
	
	/**
	 * 재설정 확정 + 비밀번호 변경
	 *
	 * 검증 규칙
	 * - user 존재 여부
	 * - token_hash 일치 여부
	 * - 만료/소비 여부
	 * - 새 비밀번호가 기존과 동일한지 여부(정책)
	 *
	 * 후처리
	 * - 토큰 consumed 처리
	 * - 기존 refresh 세션 전량 폐기
	 */
	@Transactional
	public void confirm(PasswordResetConfirmRequest request) {
		String normalizedEmail = EmailAddressNormalizer.normalize(request.email());

		/* 1) 이메일로 사용자 조회 */
		User u = userRepo.findByEmail(normalizedEmail).orElseThrow(() -> new NotFoundException("해당 이메일 계정을 찾을 수 없습니다."));
		
		/* 2) 토큰을 SHA-256(B64Url) 해시로 변환 */
		byte[] hash = CryptoUtils.sha256OfB64Url132OrNull(request.token());
		if (hash == null) {
			throw new UnauthorizedException("유효하지 않은 비밀번호 재설정 토큰입니다.");
		}
		
		/* 3) 유저 + 토큰 해시로 비밀번호 재설정 요청 조회 */
		PasswordReset pr = passwordResetRepo.findByUserAndTokenHash(u, hash).orElseThrow(() -> new UnauthorizedException("유효하지 않은 비밀번호 재설정 토큰입니다."));
		
		Instant now = Instant.now(clock);
		
		/* 4) 만료되었거나 이미 사용된 토큰인지 검사 */
		if (pr.getConsumedAt() != null || pr.getExpiresAt().isBefore(now)) {
			throw new UnauthorizedException("만료되었거나 이미 사용된 비밀번호 재설정 토큰입니다.");
		}
		
		/* 5) 새 비밀번호가 기존 비밀번호와 동일한지 검사 */
		if (u.getPasswordHash() != null && encoder.matches(request.newPassword(), u.getPasswordHash())) {
			throw new BadRequestException("이전과 동일한 비밀번호는 사용할 수 없습니다.");
		}
		
		/* 6) 비밀번호 변경 */
		u.setPasswordHash(encoder.encode(request.newPassword()));
		
		/* 7) 토큰 소비 처리 (재사용 방지) */
		passwordResetRepo.consume(pr.getId(), now);
		
		/* 8) 모든 기존 refresh 토큰 무효화 (비밀번호 재설정 시 세션 초기화) */
		refreshTokenRepo.revokeAllByUser(u, now);
		
		log.info("Password reset confirmed and refresh tokens revoked. userId={}", u.getId());
	}
	
}
