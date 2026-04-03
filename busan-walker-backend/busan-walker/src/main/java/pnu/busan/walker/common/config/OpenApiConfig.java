package pnu.busan.walker.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * springdoc-openapi 설정 자리
 * - 운영(prod)에는 노출하지 않음(프로파일로 차단)
 */
@Configuration
@Profile({"local", "dev"})
public class OpenApiConfig {
	/* 기본값 사용(커스터마이징 최소화) */
}
