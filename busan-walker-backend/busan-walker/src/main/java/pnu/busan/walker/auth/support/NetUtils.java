package pnu.busan.walker.auth.support;

import jakarta.servlet.http.HttpServletRequest;

import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * 클라이언트 IP/User-Agent 추출
 * 
 * 주의
 * - X-Forwarded-For는 프록시/로드밸런서 환경에서만 신뢰 가능
 * - 운영 환경에서는 "신뢰 가능한 프록시 목록"과 함께 적용하는 방식이 일반적
 */
public final class NetUtils {
	
	private NetUtils() {}

	/**
	 * User-Agent 추출
	 * - 헤더가 없으면 빈 문자열 반환
	 */
	public static String userAgent(HttpServletRequest request) {
		String ua = request.getHeader("User-Agent");
		return ua != null ? ua : "";
	}

	/**
	 * IP를 바이트 배열로 변환(VARBINARY(16) 저장용)
	 * - IPv4: 4 bytes, IPv6: 16 bytes
	 * - 변환 실패 시 null 반환
	 */
	public static byte[] ipBytes(HttpServletRequest request) {
		String xf = request.getHeader("X-Forwarded-For");
		String ip = (xf != null && !xf.isBlank()) ? xf.split(",")[0].trim() : request.getRemoteAddr();
		
		try {
			return InetAddress.getByName(ip).getAddress();
		} catch (UnknownHostException e) {
			return null;
		}
	}

}
