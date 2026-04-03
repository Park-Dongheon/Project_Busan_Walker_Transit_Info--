package pnu.busan.walker.auth.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import pnu.busan.walker.common.error.ApiError;
import pnu.busan.walker.common.error.ErrorCode;
import pnu.busan.walker.common.web.TraceIdFilter;

import java.io.IOException;

/**
 * 인증 실패(401) JSON 응답 표준화 엔트리포인트
 *
 * 대상
 * - Authorization(Bearer) 토큰이 없거나 무효/만료되어 인증에 실패한 경우
 *
 * 응답 형식
 * - GlobalExceptionHandler(AppException)과 동일하게 ApiError(JSON)로 반환하여
 *   프론트에서 에러 처리 규칙을 단일화할 수 있게 함
 */
@Component
@RequiredArgsConstructor
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper objectMapper;

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException authException) throws IOException {

        if (response.isCommitted()) return;

        response.setStatus(ErrorCode.AUTH_REQUIRED.getStatus().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");

        String traceId = MDC.get(TraceIdFilter.MDC_KEY);

        ApiError body = ApiError.of(
                traceId,
                ErrorCode.AUTH_REQUIRED,
                "인증이 필요합니다.",
                null
        );

        objectMapper.writeValue(response.getWriter(), body);
    }
}
