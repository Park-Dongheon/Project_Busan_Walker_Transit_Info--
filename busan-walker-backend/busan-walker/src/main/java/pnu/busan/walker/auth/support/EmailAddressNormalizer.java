package pnu.busan.walker.auth.support;

import java.util.Locale;

/**
 * Authentication flows store and look up emails in normalized form.
 */
public final class EmailAddressNormalizer {

	private EmailAddressNormalizer() {
	}

	public static String normalize(String email) {
		if (email == null) {
			return null;
		}
		return email.trim().toLowerCase(Locale.ROOT);
	}

}
