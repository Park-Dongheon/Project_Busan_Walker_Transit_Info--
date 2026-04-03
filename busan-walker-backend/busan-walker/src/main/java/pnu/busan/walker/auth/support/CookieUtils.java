package pnu.busan.walker.auth.support;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

/**
 * 요청 (HttpServletRequest)에서 쿠키를 안전하게 조회하는 유틸리티
 *
 * 별도 CookieUtils를 두는 이유
 * - 쿠키 조회/검증 로직이 컨트롤러/필터에 중복되는 것을 방지
 * - Servlet API 특성(request.getCookies()가 null일 수 있음)을 중앙에서 흡수
 * - 쿠키 조회 규칙을 표준화하여 호출부(컨트롤러)는 단순하게 유지
 *
 * 주의
 * - 이 유틸은 쿠키를 "읽기"만 담당
 *   (발급/삭제는 RefreshTokenCookieWriter 같은 전용 컴포넌트가 담당)
 * - 토큰/세션 식별자 등 민감 값은 로그로 남기지 않음
 */
public final class CookieUtils {

    private CookieUtils() {}

    /**
     * 특정 이름의 쿠키를 찾아 Cookie 객체를 반환
     *
     * 흐름
     * 1) request/cookieName 유효성 검증(null/blank 방어)
     * 2) request.getCookies()는 null을 반환할 수 있으므로 null/empty 방어
     * 3) 일치하는 이름의 쿠키를 찾으면 즉시 반환
     *
     * 반환
     * - 해당 쿠키가 있으면 Cookie
     * - 없으면 null
     */
    public static Cookie findCookie(HttpServletRequest request, String cookieName) {
        if (request == null || cookieName == null || cookieName.isBlank()) {
            return null;
        }

        Cookie[] cookies = request.getCookies();
        if (cookies == null || cookies.length == 0) {
            return null;
        }

        for (Cookie cookie : cookies) {
            if (cookieName.equals(cookie.getName())) {
                return cookie;
            }
        }

        return null;
    }

    /**
     * 특정 이름의 쿠키 값을 반환
     *
     * 목적
     * - 호출부 대부분은 Cookie 객체 자체가 아니라 "값"만 필요하므로, 접근을 단순화
     *
     * 반환
     * - 쿠키가 있으면 value
     * - 없으면 null
     */
    public static String getCookieValue(HttpServletRequest request, String cookieName) {
        Cookie cookie = findCookie(request, cookieName);
        return (cookie != null) ? cookie.getValue() : null;
    }

    /**
     * 쿠키 존재 여부만 필요한 경우를 위한 헬퍼
     * - 호출부에서 null 체크를 반복하지 않게 하기 위함
     */
    public static boolean hasCookie(HttpServletRequest request, String cookieName) {
        return findCookie(request, cookieName) != null;
    }

}
