package pnu.busan.walker.auth.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import pnu.busan.walker.auth.domain.EmailVerification;
import pnu.busan.walker.auth.domain.EmailVerificationPurpose;
import pnu.busan.walker.auth.dto.EmailVerifyRequest;
import pnu.busan.walker.auth.repository.EmailVerificationRepository;
import pnu.busan.walker.auth.support.CryptoUtils;
import pnu.busan.walker.common.error.exception.BadRequestException;
import pnu.busan.walker.common.error.exception.UnauthorizedException;
import pnu.busan.walker.user.domain.AccountStatus;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.repository.UserRepository;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EmailVerificationServiceTest {

	private static final long TOKEN_TTL_SECONDS = 24 * 60 * 60L;

	@Mock
	private UserRepository userRepo;

	@Mock
	private EmailVerificationRepository emailVerificationRepo;

	@Mock
	private MailService mailService;

	private final Clock clock = Clock.fixed(Instant.parse("2026-03-22T03:00:00Z"), ZoneOffset.UTC);

	private EmailVerificationService emailVerificationService;

	@BeforeEach
	void setUp() {
		emailVerificationService = new EmailVerificationService(
				userRepo,
				emailVerificationRepo,
				mailService,
				clock
		);
		ReflectionTestUtils.setField(emailVerificationService, "frontendBaseUrl", "http://localhost:5173");
		ReflectionTestUtils.setField(emailVerificationService, "activeProfile", "local");
	}

	@Test
	void verify_rejectsTokenWhenConsumeRaceIsLost() {
		User user = pendingUser(AccountStatus.ACTIVE, false);
		String rawToken = CryptoUtils.randomB64Url32();
		byte[] tokenHash = CryptoUtils.sha256OfB64Url132OrNull(rawToken);
		EmailVerification verification = verification(10L, user, tokenHash, clock.instant().plusSeconds(300));

		when(userRepo.findByEmail("foo@example.com")).thenReturn(Optional.of(user));
		when(emailVerificationRepo.findByUserAndTokenHashAndPurpose(user, tokenHash, EmailVerificationPurpose.SIGNUP))
				.thenReturn(Optional.of(verification));
		when(emailVerificationRepo.consume(10L, clock.instant())).thenReturn(0);

		assertThrows(
				UnauthorizedException.class,
				() -> emailVerificationService.verify(new EmailVerifyRequest("Foo@Example.com", rawToken))
		);

		assertNull(user.getEmailVerifiedAt());
		assertFalse(user.isActive());
	}

	@Test
	void verify_activatesSignupPendingUserAfterSuccessfulConsume() {
		User user = pendingUser(AccountStatus.ACTIVE, false);
		String rawToken = CryptoUtils.randomB64Url32();
		byte[] tokenHash = CryptoUtils.sha256OfB64Url132OrNull(rawToken);
		EmailVerification verification = verification(11L, user, tokenHash, clock.instant().plusSeconds(300));

		when(userRepo.findByEmail("foo@example.com")).thenReturn(Optional.of(user));
		when(emailVerificationRepo.findByUserAndTokenHashAndPurpose(user, tokenHash, EmailVerificationPurpose.SIGNUP))
				.thenReturn(Optional.of(verification));
		when(emailVerificationRepo.consume(11L, clock.instant())).thenReturn(1);

		emailVerificationService.verify(new EmailVerifyRequest("Foo@Example.com", rawToken));

		assertEquals(clock.instant(), user.getEmailVerifiedAt());
		assertTrue(user.isActive());
		assertEquals(AccountStatus.ACTIVE, user.getStatus());
	}

	@Test
	void verify_doesNotReactivateAdminDisabledUser() {
		User user = pendingUser(AccountStatus.DISABLED_BY_ADMIN, false);
		String rawToken = CryptoUtils.randomB64Url32();
		byte[] tokenHash = CryptoUtils.sha256OfB64Url132OrNull(rawToken);
		EmailVerification verification = verification(12L, user, tokenHash, clock.instant().plusSeconds(300));

		when(userRepo.findByEmail("foo@example.com")).thenReturn(Optional.of(user));
		when(emailVerificationRepo.findByUserAndTokenHashAndPurpose(user, tokenHash, EmailVerificationPurpose.SIGNUP))
				.thenReturn(Optional.of(verification));
		when(emailVerificationRepo.consume(12L, clock.instant())).thenReturn(1);

		emailVerificationService.verify(new EmailVerifyRequest("Foo@Example.com", rawToken));

		assertEquals(clock.instant(), user.getEmailVerifiedAt());
		assertFalse(user.isActive());
		assertEquals(AccountStatus.DISABLED_BY_ADMIN, user.getStatus());
	}

	@Test
	void resend_ignoresUnknownEmail() {
		when(userRepo.findByEmail("missing@example.com")).thenReturn(Optional.empty());

		emailVerificationService.resend("Missing@Example.com");

		verifyNoInteractions(emailVerificationRepo, mailService);
	}

	@Test
	void resend_ignoresAlreadyVerifiedEmail() {
		User user = pendingUser(AccountStatus.ACTIVE, true);
		user.setEmailVerifiedAt(clock.instant());
		when(userRepo.findByEmail("foo@example.com")).thenReturn(Optional.of(user));

		emailVerificationService.resend("Foo@Example.com");

		verify(emailVerificationRepo, never()).findTopByUserAndPurposeOrderByIdDesc(any(), any());
		verifyNoInteractions(mailService);
	}

	@Test
	void resend_enforcesCooldownEvenWhenCreatedAtIsMissing() {
		User user = pendingUser(AccountStatus.ACTIVE, false);
		EmailVerification last = verification(
				13L,
				user,
				new byte[32],
				clock.instant().plusSeconds(TOKEN_TTL_SECONDS - 30)
		);
		last.setCreatedAt(null);

		when(userRepo.findByEmail("foo@example.com")).thenReturn(Optional.of(user));
		when(emailVerificationRepo.findTopByUserAndPurposeOrderByIdDesc(user, EmailVerificationPurpose.SIGNUP))
				.thenReturn(Optional.of(last));

		assertThrows(BadRequestException.class, () -> emailVerificationService.resend("Foo@Example.com"));

		verify(emailVerificationRepo, never()).consumeAllActiveByUserAndPurpose(any(), any(), any());
		verifyNoInteractions(mailService);
	}

	private User pendingUser(AccountStatus status, boolean active) {
		User user = new User();
		user.setId(1L);
		user.setEmail("foo@example.com");
		user.setDisplayName("Foo");
		user.setStatus(status);
		user.setActive(active);
		return user;
	}

	private EmailVerification verification(Long id, User user, byte[] tokenHash, Instant expiresAt) {
		EmailVerification verification = new EmailVerification();
		verification.setId(id);
		verification.setUser(user);
		verification.setPurpose(EmailVerificationPurpose.SIGNUP);
		verification.setTokenHash(tokenHash);
		verification.setExpiresAt(expiresAt);
		return verification;
	}
}
