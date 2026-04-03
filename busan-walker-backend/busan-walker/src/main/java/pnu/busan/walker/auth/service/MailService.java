package pnu.busan.walker.auth.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

/**
 * Shared mail sender for auth flows.
 *
 * Design goals:
 * - keep message composition in one place
 * - fail fast with a mail-specific exception when sender configuration is missing
 * - let upstream services handle every mail failure through the same MailException contract
 */
@Service
@RequiredArgsConstructor
public class MailService {

	private static final String MAIL_ENCODING = "UTF-8";
	private static final String EMAIL_VERIFICATION_SUBJECT = "[Busan Walker] 이메일 인증 안내";
	private static final String PASSWORD_RESET_SUBJECT = "[Busan Walker] 비밀번호 재설정 안내";

	private final JavaMailSender mailSender;

	@Value("${spring.mail.username:}")
	private String from;

	public void sendEmailVerification(String to, String verifyUrl) {
		sendHtmlMail(
				to,
				EMAIL_VERIFICATION_SUBJECT,
				buildEmailVerificationBody(verifyUrl)
		);
	}

	public void sendPasswordReset(String to, String resetUrl) {
		sendHtmlMail(
				to,
				PASSWORD_RESET_SUBJECT,
				buildPasswordResetBody(resetUrl)
		);
	}

	private void sendHtmlMail(String to, String subject, String htmlBody) {
		String fromAddress = requireText(from, "spring.mail.username must be configured before sending mail.");
		String recipient = requireText(to, "Mail recipient is required.");

		try {
			MimeMessage message = mailSender.createMimeMessage();
			MimeMessageHelper helper = new MimeMessageHelper(message, MAIL_ENCODING);

			helper.setFrom(fromAddress);
			helper.setTo(recipient);
			helper.setSubject(subject);
			helper.setText(htmlBody, true);

			mailSender.send(message);
		} catch (MessagingException ex) {
			throw new MailPreparationException("Failed to prepare mail message.", ex);
		}
	}

	private String buildEmailVerificationBody(String verifyUrl) {
		String safeUrl = requireText(verifyUrl, "Email verification URL is required.");

		return """
				<p>안녕하세요, Busan Walker입니다.</p>
				<p>아래 링크를 클릭해 이메일 인증을 완료해 주세요. 링크는 일정 시간이 지나면 만료됩니다.</p>
				<p>
					<a href="%s">이메일 인증 완료하기</a>
				</p>
				<p>본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.</p>
				""".formatted(safeUrl);
	}

	private String buildPasswordResetBody(String resetUrl) {
		String safeUrl = requireText(resetUrl, "Password reset URL is required.");

		return """
				<p>안녕하세요, Busan Walker입니다.</p>
				<p>아래 링크를 클릭해 비밀번호를 재설정해 주세요. 링크는 일정 시간이 지나면 만료됩니다.</p>
				<p>
					<a href="%s">비밀번호 재설정하기</a>
				</p>
				<p>본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.</p>
				""".formatted(safeUrl);
	}

	private String requireText(String value, String message) {
		if (value == null) {
			throw new MailPreparationException(message);
		}

		String normalized = value.trim();
		if (normalized.isEmpty()) {
			throw new MailPreparationException(message);
		}
		return normalized;
	}
}
