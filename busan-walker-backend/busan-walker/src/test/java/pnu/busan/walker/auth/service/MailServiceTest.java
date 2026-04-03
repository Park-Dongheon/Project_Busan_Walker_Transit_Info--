package pnu.busan.walker.auth.service;

import jakarta.mail.Address;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.MailPreparationException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.mail.javamail.JavaMailSender;

import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MailServiceTest {

	@Mock
	private JavaMailSender mailSender;

	private MailService mailService;

	@BeforeEach
	void setUp() {
		mailService = new MailService(mailSender);
		ReflectionTestUtils.setField(mailService, "from", "noreply@busanwalker.test");
	}

	@Test
	void sendEmailVerification_buildsExpectedMessage() throws Exception {
		MimeMessage mimeMessage = new MimeMessage(Session.getInstance(new Properties()));
		when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

		String verifyUrl = "http://localhost:5173/auth/email/verify?email=foo%40example.com&token=abc";
		mailService.sendEmailVerification("foo@example.com", verifyUrl);

		ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
		verify(mailSender).send(captor.capture());

		MimeMessage sent = captor.getValue();
		assertEquals("[Busan Walker] 이메일 인증 안내", sent.getSubject());
		assertEquals("noreply@busanwalker.test", ((InternetAddress) sent.getFrom()[0]).getAddress());
		assertEquals("foo@example.com", firstRecipient(sent.getAllRecipients()));
		assertTrue(sent.getContent().toString().contains(verifyUrl));
		assertTrue(sent.getContent().toString().contains("이메일 인증 완료하기"));
	}

	@Test
	void sendPasswordReset_buildsExpectedMessage() throws Exception {
		MimeMessage mimeMessage = new MimeMessage(Session.getInstance(new Properties()));
		when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

		String resetUrl = "http://localhost:5173/auth/password/reset?email=foo%40example.com&token=reset";
		mailService.sendPasswordReset("foo@example.com", resetUrl);

		ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
		verify(mailSender).send(captor.capture());

		MimeMessage sent = captor.getValue();
		assertEquals("[Busan Walker] 비밀번호 재설정 안내", sent.getSubject());
		assertEquals("foo@example.com", firstRecipient(sent.getAllRecipients()));
		assertTrue(sent.getContent().toString().contains(resetUrl));
		assertTrue(sent.getContent().toString().contains("비밀번호 재설정하기"));
	}

	@Test
	void sendEmailVerification_failsFastWhenSenderIsMissing() {
		ReflectionTestUtils.setField(mailService, "from", "   ");

		assertThrows(
				MailPreparationException.class,
				() -> mailService.sendEmailVerification("foo@example.com", "http://localhost:5173/auth/email/verify")
		);

		verifyNoInteractions(mailSender);
	}

	private String firstRecipient(Address[] recipients) {
		return ((InternetAddress) recipients[0]).getAddress();
	}
}
