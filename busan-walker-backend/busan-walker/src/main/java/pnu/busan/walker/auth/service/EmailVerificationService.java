package pnu.busan.walker.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pnu.busan.walker.auth.domain.EmailVerification;
import pnu.busan.walker.auth.domain.EmailVerificationPurpose;
import pnu.busan.walker.auth.dto.EmailVerifyRequest;
import pnu.busan.walker.auth.repository.EmailVerificationRepository;
import pnu.busan.walker.auth.support.CryptoUtils;
import pnu.busan.walker.auth.support.EmailAddressNormalizer;
import pnu.busan.walker.common.error.exception.BadRequestException;
import pnu.busan.walker.common.error.exception.UnauthorizedException;
import pnu.busan.walker.user.domain.AccountStatus;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.repository.UserRepository;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;

/**
 * Signup email verification service.
 *
 * Responsibilities:
 * - issue and resend one-time verification links
 * - verify a submitted token exactly once
 * - keep resend behavior opaque so account existence is not exposed
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailVerificationService {

	private static final long TOKEN_TTL_SECONDS = 24 * 60 * 60L;
	private static final long RESEND_COOLDOWN_SECONDS = 60L;

	private final UserRepository userRepo;
	private final EmailVerificationRepository emailVerificationRepo;
	private final MailService mailService;
	private final Clock clock;

	@Value("${app.frontend-base-url}")
	private String frontendBaseUrl;

	@Value("${spring.profiles.active:local}")
	private String activeProfile;

	@Transactional
	public String issueForUser(User user) {
		return issueForUser(user, EmailVerificationPurpose.SIGNUP);
	}

	@Transactional
	public String issueForUser(User user, EmailVerificationPurpose purpose) {
		Instant now = clock.instant();
		Instant expiresAt = now.plusSeconds(TOKEN_TTL_SECONDS);

		String rawToken = CryptoUtils.randomB64Url32();
		byte[] tokenHash = CryptoUtils.sha256OfB64Url132OrNull(rawToken);

		EmailVerification verification = new EmailVerification();
		verification.setUser(user);
		verification.setPurpose(purpose);
		verification.setTokenHash(tokenHash);
		verification.setExpiresAt(expiresAt);
		emailVerificationRepo.save(verification);

		String verifyUrl = buildVerifyUrl(user.getEmail(), rawToken);

		try {
			mailService.sendEmailVerification(user.getEmail(), verifyUrl);
		} catch (MailException ex) {
			log.error("Email verification mail send failed. email={}, reason={}", user.getEmail(), ex.getMessage());
			throw new IllegalStateException("이메일 인증 메일 발송에 실패했습니다.", ex);
		}

		if (activeProfile != null && activeProfile.contains("local")) {
			return rawToken;
		}
		return null;
	}

	@Transactional
	public void verify(EmailVerifyRequest request) {
		String normalizedEmail = EmailAddressNormalizer.normalize(request.email());
		User user = userRepo.findByEmail(normalizedEmail)
				.orElseThrow(this::invalidVerificationToken);

		byte[] tokenHash = CryptoUtils.sha256OfB64Url132OrNull(request.token());
		if (tokenHash == null) {
			throw invalidVerificationToken();
		}

		EmailVerification verification = emailVerificationRepo
				.findByUserAndTokenHashAndPurpose(user, tokenHash, EmailVerificationPurpose.SIGNUP)
				.orElseThrow(this::invalidVerificationToken);

		Instant now = clock.instant();
		if (verification.getConsumedAt() != null || !verification.getExpiresAt().isAfter(now)) {
			throw expiredOrConsumedToken();
		}

		// Consume first so concurrent duplicate clicks cannot both succeed.
		int consumed = emailVerificationRepo.consume(verification.getId(), now);
		if (consumed != 1) {
			throw expiredOrConsumedToken();
		}

		user.setEmailVerifiedAt(now);

		// Signup-pending accounts become active after verification.
		if (!user.isActive() && user.getStatus() == AccountStatus.ACTIVE) {
			user.setActive(true);
		}
	}

	@Transactional
	public void resend(String email) {
		String normalizedEmail = EmailAddressNormalizer.normalize(email);
		User user = userRepo.findByEmail(normalizedEmail).orElse(null);

		// Keep the response opaque so resend cannot be used for account enumeration.
		if (user == null) {
			log.info("Email verification resend requested for unknown email. email={}", normalizedEmail);
			return;
		}
		if (user.getEmailVerifiedAt() != null) {
			log.info("Email verification resend skipped for already verified email. userId={}", user.getId());
			return;
		}

		Instant now = clock.instant();

		emailVerificationRepo.findTopByUserAndPurposeOrderByIdDesc(user, EmailVerificationPurpose.SIGNUP)
				.ifPresent(last -> {
					Instant lastIssuedAt = resolveIssuedAt(last);
					if (lastIssuedAt != null && lastIssuedAt.plusSeconds(RESEND_COOLDOWN_SECONDS).isAfter(now)) {
						throw new BadRequestException("인증 메일은 잠시 후 다시 요청해 주세요.");
					}
				});

		int affected = emailVerificationRepo.consumeAllActiveByUserAndPurpose(
				user,
				EmailVerificationPurpose.SIGNUP,
				now
		);
		log.info("Consumed {} active signup verification tokens before resend. userId={}", affected, user.getId());

		issueForUser(user, EmailVerificationPurpose.SIGNUP);
	}

	private String buildVerifyUrl(String email, String rawToken) {
		return String.format(
				"%s/auth/email/verify?email=%s&token=%s",
				frontendBaseUrl,
				URLEncoder.encode(email, StandardCharsets.UTF_8),
				rawToken
		);
	}

	private Instant resolveIssuedAt(EmailVerification verification) {
		if (verification.getCreatedAt() != null) {
			return verification.getCreatedAt();
		}
		if (verification.getExpiresAt() != null) {
			return verification.getExpiresAt().minusSeconds(TOKEN_TTL_SECONDS);
		}
		return null;
	}

	private UnauthorizedException invalidVerificationToken() {
		return new UnauthorizedException("유효하지 않은 이메일 인증 토큰입니다.");
	}

	private UnauthorizedException expiredOrConsumedToken() {
		return new UnauthorizedException("만료되었거나 이미 사용된 이메일 인증 토큰입니다.");
	}
}
