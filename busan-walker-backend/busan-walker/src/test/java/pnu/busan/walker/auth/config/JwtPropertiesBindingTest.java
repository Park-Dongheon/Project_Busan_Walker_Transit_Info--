package pnu.busan.walker.auth.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class JwtPropertiesBindingTest {

	private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
			.withUserConfiguration(TestConfiguration.class);

	@Test
	void bindsDurationStyleJwtTtlProperties() {
		contextRunner
				.withPropertyValues(
						"app.security.jwt.active-kid=main-v1",
						"app.security.jwt.keys.main-v1=QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE",
						"app.security.jwt.access-ttl=30m",
						"app.security.jwt.refresh-ttl=14d"
				)
				.run(context -> {
					JwtProperties props = context.getBean(JwtProperties.class);
					assertThat(props.getAccessTtl()).isEqualTo(Duration.ofMinutes(30));
					assertThat(props.getRefreshTtl()).isEqualTo(Duration.ofDays(14));
				});
	}

	@Configuration(proxyBeanMethods = false)
	@EnableConfigurationProperties(JwtProperties.class)
	static class TestConfiguration {
	}
}
