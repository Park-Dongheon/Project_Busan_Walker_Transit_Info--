package pnu.busan.walker.auth.dto;

/**
 * Access/Refresh 토큰 묶음
 *
 * 반환 의도
 * - accessToken		: API 호출에 사용(Bearer)
 * - refreshToken		: 만료 시 재발급/회전에 사용(클라이언트 보관)
 * - refreshExpiresAtMs	: refreshToken의 만료 시각(epoch millis)
 * 	- 프론트에서 "정확한 만료 타이머"를 표시하기 위한 단일 기준값
 */
public record TokenPair(
		String accessToken,
		String refreshToken,
		long refreshExpiresAtMs
) {}
