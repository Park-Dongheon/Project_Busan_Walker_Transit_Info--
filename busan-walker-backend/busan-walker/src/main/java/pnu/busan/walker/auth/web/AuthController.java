package pnu.busan.walker.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import pnu.busan.walker.auth.dto.*;
import pnu.busan.walker.auth.service.AuthService;
import pnu.busan.walker.auth.service.EmailVerificationService;
import pnu.busan.walker.auth.service.PasswordResetService;
import pnu.busan.walker.auth.support.CookieUtils;
import pnu.busan.walker.auth.support.NetUtils;
import pnu.busan.walker.common.error.exception.UnauthorizedException;
import pnu.busan.walker.common.security.csrf.CsrfProperties;
import pnu.busan.walker.common.security.csrf.CsrfTokenCookieWriter;
import pnu.busan.walker.common.security.csrf.CsrfTokenService;

import static org.springframework.http.MediaType.APPLICATION_JSON_VALUE;

/**
 * AuthController (Cookie-only)
 *
 * 설계 포인트
 * - refreshToken: HttpOnly 쿠키로만 전달/저장 (JS 접근 불가)
 * - accessToken: 응답 바디(JSON)로만 전달 (프론트가 메모리에서 관리)
 *
 * CSRF 처리 포인트:
 * - refresh/logout 같은 "쿠키 기반 상태 변경" 엔드포인트는 CSRF 방어 필요
 * - 서버가 CSRF 쿠키(HttpOnly=false)를 발급
 * - 프론트가 쿠키 값을 읽어 헤더(X-CSRF-Token)로 다시 올려서 전송
 * - 서버는 쿠키 값과 헤더 값이 일치하는지 검사
 */
@RestController
@RequestMapping(path = "/api/v1/auth", produces = APPLICATION_JSON_VALUE)
@RequiredArgsConstructor
@Validated
public class AuthController {

	private final AuthService authService;
	private final PasswordResetService passwordResetService;
	private final EmailVerificationService emailVerificationService;
	private final RefreshTokenCookieWriter refreshTokenCookieWriter;

	private final CsrfTokenService csrfTokenService;
	private final CsrfTokenCookieWriter csrfTokenCookieWriter;
	private final CsrfProperties csrfProperties;

	@PostMapping("/register")
	public void register(@Valid @RequestBody RegisterRequest request) {
		authService.register(request);
	}

	/**
	 * 이메일 인증
	 */
	@PostMapping("/email/verify")
	public void verifyEmail(@Valid @RequestBody EmailVerifyRequest request) {
		emailVerificationService.verify(request);
	}

	@PostMapping("/email/resend")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void resendEmailVerification(@Valid @RequestBody EmailVerificationResendRequest request) {
		emailVerificationService.resend(request.email());
	}

	/**
	 * CSRF 토큰 발급(브라우저가 최초 1회 호출해도 됨)
	 *
	 * 목적
	 * - refreshToken 쿠키가 이미 존재하는 사용자(재방문)가 refresh 호출 전에 CSRF 쿠키를 확보할 수 있게 함
	 */
	@GetMapping("/csrf")
	public ResponseEntity<Void> issueCsrf() {
		String token = csrfTokenService.generateToken();
		ResponseCookie csrfCookie = csrfTokenCookieWriter.issue(token);

		return ResponseEntity.noContent()
				.header(HttpHeaders.CACHE_CONTROL, "no-store")
				.header(HttpHeaders.SET_COOKIE, csrfCookie.toString())
				.header(csrfProperties.getHeaderName(), token)
				.build();
	}

	/**
	 * 로그인
	 * - refreshToken은 HttpOnly 쿠키로만 발급
	 * - CSRF 토큰 쿠키(non-HttpOnly)도 함께 발급하여 refresh/logout 보호
	 *
	 * 보안 포인트
	 * - 인증 관련 응답은 캐시되면 안 되므로 Cache-Control: no-store 적용
	 */
	@PostMapping("/login")
	public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
		LoginResult result = authService.login(request, NetUtils.ipBytes(http), NetUtils.userAgent(http));

		TokenPair pair = result.tokenPair();

		/* refreshToken 쿠키 발급 */
		ResponseCookie rtCookie = refreshTokenCookieWriter.issue(pair.refreshToken(), pair.refreshExpiresAtMs());

		/* CSRF 토큰 발급(쿠키 + 헤더) */
		String csrf = csrfTokenService.generateToken();
		ResponseCookie csrfCookie = csrfTokenCookieWriter.issue(csrf);

		BrowserTokens tokens = new BrowserTokens(pair.accessToken());

		LoginResponse body = new LoginResponse(
				String.valueOf(result.userId()),
				result.email(),
				result.displayName(),
				result.role(),
				tokens
		);

		return ResponseEntity.ok()
				.header(HttpHeaders.CACHE_CONTROL, "no-store")
				.header(HttpHeaders.SET_COOKIE, rtCookie.toString())
				.header(HttpHeaders.SET_COOKIE, csrfCookie.toString())
				.header(csrfProperties.getHeaderName(), csrf)
				.body(body);
	}

	/**
	 * AccessToken 재발급(refresh) + RefreshToken 회전
	 *
	 * 동작
	 * - 요청 바디 없이 호출
	 * - refreshToken은 HttpOnly 쿠키에서만 읽음
	 * - refreshToken 회전(rotation) 정책에 따라, 성공 시 Set-Cookie로 새 refreshToken을 내려줌
	 * - CSRF 토큰도 함께 재발급(회전)하여 장기 세션에서도 신선도 유지
	 * - 응답 바디는 accessToken만 반환
	 *
	 * 에러 처리
	 * - 예외는 GlobalExceptionHandler(표준 ApiError)로 수렴
	 * - refresh/logout에서 실패할 경우 쿠키를 정리(Set-Cookie clear)는 AuthCookieExceptionHandler에서 수행
	 */
	@PostMapping("/refresh")
	public ResponseEntity<?> refresh(HttpServletRequest request) {
		String rt = CookieUtils.getCookieValue(request, refreshTokenCookieWriter.cookieName());

		if (rt == null || rt.isBlank()) {
			/*
			  "빈 401"을 내리기 보다
			  - code/message가 있는 표준 에러(JSON)를 내려 프론트가 분기할 수 있게함
			 */
			throw new UnauthorizedException("로그인이 필요합니다.");
		}

		TokenPair pair = authService.refresh(
				new RefreshRequest(rt),
				NetUtils.ipBytes(request),
				NetUtils.userAgent(request)
		);

		/* 회전된 refreshToken을 쿠키로 갱신 */
		ResponseCookie rtCookie = refreshTokenCookieWriter.issue(pair.refreshToken(), pair.refreshExpiresAtMs());

		/* CSRF도 함께 갱신(쿠키 + 헤더) */
		String csrf = csrfTokenService.generateToken();
		ResponseCookie csrfCookie = csrfTokenCookieWriter.issue(csrf);

		BrowserTokens body = new BrowserTokens(pair.accessToken());

		return ResponseEntity.ok()
				.header(HttpHeaders.CACHE_CONTROL, "no-store")
				.header(HttpHeaders.SET_COOKIE, rtCookie.toString())
				.header(HttpHeaders.SET_COOKIE, csrfCookie.toString())
				.header(csrfProperties.getHeaderName(), csrf)
				.body(body);
	}

	/**
	 * 로그아웃
	 *
	 * 동작
	 * - refreshToken을 서버에서 폐기(revoke)하고, 쿠키 삭제(Set-Cookie)로 브라우저 상태를 정리
	 * - CSRF 쿠키도 함께 삭제(브라우저 상태 정리)
	 * - 프론트는 accessToken을 메모리에서 제거하여 즉시 비로그인 상태로 수렴
	 */
	@PostMapping("/logout")
	public ResponseEntity<Void> logout(HttpServletRequest request) {
		String rt = CookieUtils.getCookieValue(request, refreshTokenCookieWriter.cookieName());

		/* 쿠키가 없더라도 idempotent 하게 처리(서버 상태 정리 + 쿠키 클리어) */
		if (rt != null && !rt.isBlank()) {
			authService.logout(new LogoutRequest(rt));
		}

		ResponseCookie clearRt = refreshTokenCookieWriter.clear();
		ResponseCookie clearCsrf = csrfTokenCookieWriter.clear();

		return ResponseEntity.noContent()
				.header(HttpHeaders.CACHE_CONTROL, "no-store")
				.header(HttpHeaders.SET_COOKIE, clearRt.toString())
				.header(HttpHeaders.SET_COOKIE, clearCsrf.toString())
				.build();
	}

	/**
	 * 비밀번호 재설정 토큰 발급
	 * - 응답 바디 없이 204를 반환(메일 발성 성공만 의미)
	 */
	@PostMapping("/password/reset-request")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void issueReset(@Valid @RequestBody PasswordResetRequest request) {
		passwordResetService.issue(request);
	}

	@PostMapping("/password/reset-confirm")
	public void confirmReset(@Valid @RequestBody PasswordResetConfirmRequest request) {
		passwordResetService.confirm(request);
	}

}
