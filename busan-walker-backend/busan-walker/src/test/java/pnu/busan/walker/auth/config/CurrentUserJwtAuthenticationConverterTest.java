package pnu.busan.walker.auth.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import pnu.busan.walker.common.domain.Role;
import pnu.busan.walker.user.domain.AccountStatus;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.repository.UserRepository;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CurrentUserJwtAuthenticationConverterTest {

	@Mock
	private UserRepository userRepository;

	private CurrentUserJwtAuthenticationConverter converter;

	@BeforeEach
	void setUp() {
		converter = new CurrentUserJwtAuthenticationConverter(userRepository);
	}

	@Test
	void convert_usesCurrentDatabaseRole() {
		User user = activeUser();
		user.setRole(Role.ADMIN);
		when(userRepository.findById(1L)).thenReturn(Optional.of(user));

		Jwt jwt = jwt("1", "MEMBER");

		JwtAuthenticationToken authentication = converter.convert(jwt);

		assertInstanceOf(JwtAuthenticationToken.class, authentication);
		assertSame(jwt, authentication.getToken());
		assertEquals("ROLE_ADMIN", authentication.getAuthorities().iterator().next().getAuthority());
	}

	@Test
	void convert_rejectsInactiveUser() {
		User user = activeUser();
		user.setActive(false);
		user.setStatus(AccountStatus.DISABLED_BY_ADMIN);
		when(userRepository.findById(1L)).thenReturn(Optional.of(user));

		assertThrows(DisabledException.class, () -> converter.convert(jwt("1", "ADMIN")));
	}

	@Test
	void convert_rejectsUnknownUser() {
		when(userRepository.findById(1L)).thenReturn(Optional.empty());

		assertThrows(BadCredentialsException.class, () -> converter.convert(jwt("1", "ADMIN")));
	}

	@Test
	void convert_rejectsUnverifiedUser() {
		User user = activeUser();
		user.setEmailVerifiedAt(null);
		when(userRepository.findById(1L)).thenReturn(Optional.of(user));

		assertThrows(BadCredentialsException.class, () -> converter.convert(jwt("1", "ADMIN")));
	}

	@Test
	void convert_rejectsInvalidSubject() {
		assertThrows(BadCredentialsException.class, () -> converter.convert(jwt("not-a-number", "ADMIN")));
	}

	private Jwt jwt(String subject, String role) {
		return Jwt.withTokenValue("token-value")
				.header("alg", "HS256")
				.claim("sub", subject)
				.claim("role", role)
				.build();
	}

	private User activeUser() {
		User user = new User();
		user.setId(1L);
		user.setEmail("foo@example.com");
		user.setDisplayName("Foo");
		user.setRole(Role.MEMBER);
		user.setEmailVerifiedAt(Instant.parse("2026-03-17T09:00:00Z"));
		user.setActive(true);
		user.setStatus(AccountStatus.ACTIVE);
		return user;
	}
}
