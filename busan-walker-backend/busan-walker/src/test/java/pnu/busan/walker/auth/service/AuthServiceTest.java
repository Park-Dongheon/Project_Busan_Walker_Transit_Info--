package pnu.busan.walker.auth.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pnu.busan.walker.auth.dto.RefreshRequest;
import pnu.busan.walker.auth.config.JwtProperties;
import pnu.busan.walker.auth.domain.RefreshToken;
import pnu.busan.walker.auth.dto.LoginRequest;
import pnu.busan.walker.auth.dto.LoginResult;
import pnu.busan.walker.auth.jwt.JwtIssuer;
import pnu.busan.walker.auth.repository.RefreshTokenRepository;
import pnu.busan.walker.auth.support.CryptoUtils;
import pnu.busan.walker.common.domain.Role;
import pnu.busan.walker.common.error.exception.UnauthorizedException;
import pnu.busan.walker.user.domain.AccountStatus;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.repository.UserRepository;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

	@Mock
	private UserRepository userRepo;

	@Mock
	private RefreshTokenRepository refreshTokenRepo;

	@Mock
	private EmailVerificationService emailVerificationService;

	@Mock
	private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

	@Mock
	private JwtIssuer jwtIssuer;

	private final Clock clock = Clock.fixed(Instant.parse("2026-03-17T09:00:00Z"), ZoneOffset.UTC);

	private AuthService authService;

	@BeforeEach
	void setUp() {
		JwtProperties props = new JwtProperties();
		props.setRefreshTtl(Duration.ofDays(14));
		authService = new AuthService(
				userRepo,
				refreshTokenRepo,
				emailVerificationService,
				passwordEncoder,
				jwtIssuer,
				props,
				clock
		);
	}

	@Test
	void login_normalizesEmailAndReactivatesSelfDisabledUser() {
		User user = verifiedUser(AccountStatus.DISABLED_BY_USER, false);
		when(userRepo.findByEmail("foo@example.com")).thenReturn(Optional.of(user));
		when(passwordEncoder.matches("Password1!", "encoded-password")).thenReturn(true);
		when(jwtIssuer.issueAccessToken(1L, "foo@example.com", "MEMBER")).thenReturn("access-token");

		LoginResult result = authService.login(new LoginRequest("Foo@Example.com", "Password1!"), null, "Chrome");

		verify(userRepo).findByEmail("foo@example.com");
		assertTrue(user.isActive());
		assertEquals(AccountStatus.ACTIVE, user.getStatus());
		assertEquals("access-token", result.tokenPair().accessToken());
		assertEquals("foo@example.com", result.email());
		assertTrue(result.tokenPair().refreshExpiresAtMs() > clock.instant().toEpochMilli());

		ArgumentCaptor<RefreshToken> refreshTokenCaptor = ArgumentCaptor.forClass(RefreshToken.class);
		verify(refreshTokenRepo).save(refreshTokenCaptor.capture());
		RefreshToken saved = refreshTokenCaptor.getValue();
		assertEquals(clock.instant().plus(Duration.ofDays(14)), saved.getExpiresAt());
		assertEquals(user, saved.getUser());
		assertNotNull(saved.getJti());
		assertNotNull(saved.getTokenHash());
	}

	@Test
	void login_keepsAdminDisabledUserBlocked() {
		User user = verifiedUser(AccountStatus.DISABLED_BY_ADMIN, false);
		when(userRepo.findByEmail("foo@example.com")).thenReturn(Optional.of(user));
		when(passwordEncoder.matches("Password1!", "encoded-password")).thenReturn(true);

		assertThrows(
				UnauthorizedException.class,
				() -> authService.login(new LoginRequest("Foo@Example.com", "Password1!"), null, "Chrome")
		);

		assertEquals(AccountStatus.DISABLED_BY_ADMIN, user.getStatus());
		verify(refreshTokenRepo, never()).save(any());
		verify(jwtIssuer, never()).issueAccessToken(anyLong(), any(), any());
	}

	@Test
	void login_truncatesOversizedUserAgentBeforePersisting() {
		User user = verifiedUser(AccountStatus.ACTIVE, true);
		when(userRepo.findByEmail("foo@example.com")).thenReturn(Optional.of(user));
		when(passwordEncoder.matches("Password1!", "encoded-password")).thenReturn(true);
		when(jwtIssuer.issueAccessToken(1L, "foo@example.com", "MEMBER")).thenReturn("access-token");

		String userAgent = "A".repeat(300);

		authService.login(new LoginRequest("Foo@Example.com", "Password1!"), null, "  " + userAgent + "  ");

		ArgumentCaptor<RefreshToken> refreshTokenCaptor = ArgumentCaptor.forClass(RefreshToken.class);
		verify(refreshTokenRepo).save(refreshTokenCaptor.capture());
		assertEquals(255, refreshTokenCaptor.getValue().getUserAgent().length());
		assertEquals(userAgent.substring(0, 255), refreshTokenCaptor.getValue().getUserAgent());
	}

	@Test
	void refresh_rejectsInactiveUserAndRevokesFamily() {
		User user = verifiedUser(AccountStatus.DISABLED_BY_ADMIN, false);
		String rawRefreshToken = CryptoUtils.randomB64Url32();
		byte[] tokenHash = CryptoUtils.sha256OfB64Url132OrNull(rawRefreshToken);
		byte[] familyJti = fromUuid(UUID.randomUUID());

		RefreshToken refreshToken = RefreshToken.builder()
				.id(10L)
				.user(user)
				.jti(familyJti)
				.tokenHash(tokenHash)
				.issuedAt(clock.instant().minusSeconds(60))
				.expiresAt(clock.instant().plus(Duration.ofDays(14)))
				.build();

		when(refreshTokenRepo.findByTokenHashWithUser(tokenHash)).thenReturn(Optional.of(refreshToken));

		assertThrows(
				UnauthorizedException.class,
				() -> authService.refresh(new RefreshRequest(rawRefreshToken), null, "Chrome")
		);

		verify(refreshTokenRepo).revokeFamily(familyJti, clock.instant());
		verify(refreshTokenRepo, never()).consume(anyLong(), any());
	}

	private User verifiedUser(AccountStatus status, boolean active) {
		User user = new User();
		user.setId(1L);
		user.setEmail("foo@example.com");
		user.setDisplayName("Foo");
		user.setRole(Role.MEMBER);
		user.setPasswordHash("encoded-password");
		user.setEmailVerifiedAt(clock.instant());
		user.setStatus(status);
		user.setActive(active);
		return user;
	}

	private byte[] fromUuid(UUID jti) {
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
}
