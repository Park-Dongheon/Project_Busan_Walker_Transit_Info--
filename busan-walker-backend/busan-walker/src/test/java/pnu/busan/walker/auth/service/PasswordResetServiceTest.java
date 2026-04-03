package pnu.busan.walker.auth.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import pnu.busan.walker.auth.domain.PasswordReset;
import pnu.busan.walker.auth.dto.PasswordResetConfirmRequest;
import pnu.busan.walker.auth.dto.PasswordResetRequest;
import pnu.busan.walker.auth.repository.PasswordResetRepository;
import pnu.busan.walker.auth.repository.RefreshTokenRepository;
import pnu.busan.walker.auth.support.CryptoUtils;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.repository.UserRepository;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PasswordResetServiceTest {

	@Mock
	private UserRepository userRepo;

	@Mock
	private PasswordResetRepository passwordResetRepo;

	@Mock
	private PasswordEncoder encoder;

	@Mock
	private RefreshTokenRepository refreshTokenRepo;

	@Mock
	private MailService mailService;

	private final Clock clock = Clock.fixed(Instant.parse("2026-03-17T09:00:00Z"), ZoneOffset.UTC);

	private PasswordResetService passwordResetService;

	@BeforeEach
	void setUp() {
		passwordResetService = new PasswordResetService(
				userRepo,
				passwordResetRepo,
				encoder,
				refreshTokenRepo,
				mailService,
				clock
		);
		ReflectionTestUtils.setField(passwordResetService, "frontendBaseUrl", "http://localhost:5173");
	}

	@Test
	void issue_normalizesEmailBeforeLookup() {
		User user = user(1L, "foo@example.com", "encoded-password");
		when(userRepo.findByEmail("foo@example.com")).thenReturn(Optional.of(user));
		when(passwordResetRepo.findFirstByUserAndConsumedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(user, clock.instant()))
				.thenReturn(Optional.empty());

		passwordResetService.issue(new PasswordResetRequest("Foo@Example.com"));

		verify(userRepo).findByEmail("foo@example.com");
		verify(passwordResetRepo).save(any(PasswordReset.class));
		verify(mailService).sendPasswordReset(eq("foo@example.com"), anyString());
	}

	@Test
	void confirm_normalizesEmailBeforeLookupAndRevokesAllSessions() {
		User user = user(1L, "foo@example.com", "encoded-password");
		String rawToken = CryptoUtils.randomB64Url32();
		byte[] expectedHash = CryptoUtils.sha256OfB64Url132OrNull(rawToken);
		PasswordReset reset = PasswordReset.builder()
				.id(10L)
				.user(user)
				.tokenHash(expectedHash)
				.expiresAt(clock.instant().plusSeconds(1800))
				.build();

		when(userRepo.findByEmail("foo@example.com")).thenReturn(Optional.of(user));
		when(passwordResetRepo.findByUserAndTokenHash(eq(user), any(byte[].class))).thenReturn(Optional.of(reset));
		when(encoder.matches("NewPassword1!", "encoded-password")).thenReturn(false);
		when(encoder.encode("NewPassword1!")).thenReturn("new-password-hash");

		passwordResetService.confirm(new PasswordResetConfirmRequest("Foo@Example.com", rawToken, "NewPassword1!"));

		verify(userRepo).findByEmail("foo@example.com");

		ArgumentCaptor<byte[]> hashCaptor = ArgumentCaptor.forClass(byte[].class);
		verify(passwordResetRepo).findByUserAndTokenHash(eq(user), hashCaptor.capture());
		assertArrayEquals(expectedHash, hashCaptor.getValue());

		assertEquals("new-password-hash", user.getPasswordHash());
		verify(passwordResetRepo).consume(10L, clock.instant());
		verify(refreshTokenRepo).revokeAllByUser(user, clock.instant());
	}

	private User user(Long id, String email, String passwordHash) {
		User user = new User();
		user.setId(id);
		user.setEmail(email);
		user.setPasswordHash(passwordHash);
		user.setDisplayName("tester-" + id);
		return user;
	}
}
