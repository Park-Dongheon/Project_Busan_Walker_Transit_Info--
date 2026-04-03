package pnu.busan.walker.auth.config;

import lombok.RequiredArgsConstructor;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.repository.UserRepository;

import java.util.List;

/**
 * JWT claims alone are not enough to decide whether the current account can still use the API.
 * We re-check the live user row so that deactivation and role changes take effect immediately.
 */
@Component
@RequiredArgsConstructor
public class CurrentUserJwtAuthenticationConverter implements Converter<Jwt, JwtAuthenticationToken> {

	private final UserRepository userRepository;

	@Override
	public JwtAuthenticationToken convert(Jwt jwt) {
		long userId = parseUserId(jwt.getSubject());
		User user = userRepository.findById(userId)
				.orElseThrow(() -> new BadCredentialsException("Token subject does not match a user."));

		if (user.getEmailVerifiedAt() == null) {
			throw new BadCredentialsException("Email verification required.");
		}
		if (!user.isLoginEnabled()) {
			throw new DisabledException("Account inactive.");
		}

		List<GrantedAuthority> authorities = List.of(
				new SimpleGrantedAuthority("ROLE_" + user.getRole().name())
		);
		return new JwtAuthenticationToken(jwt, authorities);
	}

	private static long parseUserId(String subject) {
		try {
			return Long.parseLong(subject);
		} catch (RuntimeException ex) {
			throw new BadCredentialsException("Invalid token subject.", ex);
		}
	}
}
