package pnu.busan.walker.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.jspecify.annotations.NonNull;
import org.slf4j.MDC;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * TraceIdFilter
 *
 * 목적
 * - 요청 단위 식별자(traceId)를 생성/전파하여 로그와 에러 응답을 “하나의 요청”으로 묶어 추적 가능하게 함
 *
 * 동작
 * 1) 요청 헤더 X-Trace-Id가 있으면 그 값을 사용(프록시/클라이언트가 이미 발급한 경우)
 * 2) 없으면 서버가 UUID 기반 traceId를 생성
 * 3) 응답 헤더 X-Trace-Id로 내려서 프론트/게이트웨이/로그 수집기가 확인 가능
 * 4) MDC에 traceId를 넣어 로그 패턴에서 %X{traceId}로 출력 가능
 */
public class TraceIdFilter extends OncePerRequestFilter {

	public static final String TRACE_ID_HEADER = "X-Trace-Id";
	public static final String MDC_KEY = "traceId";

	@Override
	protected void doFilterInternal(
			@NonNull HttpServletRequest request,
			@NonNull HttpServletResponse response,
			@NonNull FilterChain filterChain
	) throws ServletException, IOException {

		String incoming = request.getHeader(TRACE_ID_HEADER);
		String traceId = StringUtils.hasText(incoming) ? incoming : generateTraceId();

		/**
		 * 응답 헤더에 traceId를 내려 프론트/로그/모니터링에서 상호 추적 가능하게 함
		 * - CORS에서 exposedHeaders에 X-Trace-Id를 포함해야 브라우저에서 읽을 수 있음
		 */
		response.setHeader(TRACE_ID_HEADER, traceId);

		/**
		 * MDC 설정
		 * - 로깅 패턴에서 %X{traceId}로 출력 가능
		 * - 반드시 finally에서 제거하여 스레드 재사용 시 오염을 방지
		 */
		MDC.put(MDC_KEY, traceId);
		try {
			filterChain.doFilter(request, response);
		} finally {
			MDC.remove(MDC_KEY);
		}
	}

	private String generateTraceId() {
		return UUID.randomUUID().toString().replace("-", "");
	}

}
