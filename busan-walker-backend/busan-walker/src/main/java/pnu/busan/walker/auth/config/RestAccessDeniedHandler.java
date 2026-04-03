package pnu.busan.walker.auth.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;
import pnu.busan.walker.common.error.ApiError;
import pnu.busan.walker.common.error.ErrorCode;
import pnu.busan.walker.common.web.TraceIdFilter;

import java.io.IOException;

/**
 * 권한 거부(403) JSON 응답 표준화 핸들러
 *
 * 대상
 * - 인증은 되었지만(토큰 유효) 권한(ROLE 등)이 부족한 경우
 * - @PreAuthorize 등 메서드 보안에서 AccessDeniedException이 발생한 경우
 */
@Component
@RequiredArgsConstructor
public class RestAccessDeniedHandler implements AccessDeniedHandler {

    private final ObjectMapper objectMapper;

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException accessDeniedException) throws IOException {
        if (response.isCommitted()) return;

        response.setStatus(ErrorCode.FORBIDDEN.getStatus().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");

        String traceId = MDC.get(TraceIdFilter.MDC_KEY);

        ApiError body = ApiError.of(
            traceId,
            ErrorCode.FORBIDDEN,
            "접근 권한이 없습니다.",
            null
        );

        objectMapper.writeValue(response.getWriter(), body);
    }
}
