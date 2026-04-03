package pnu.busan.walker.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

/**
 * Jackson 시간 포맷 기본값 보강
 * - Boot 기본(ISO-8601)을 그대로 사용, 필요시 직렬화 보장만 명시
 */
@Configuration
public class JacksonTimeConfig {

	@Bean
	Jackson2ObjectMapperBuilder jacksonBuilder() {
		return new Jackson2ObjectMapperBuilder()
			.simpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX");		// ISO-8601
	}

}
