package pnu.busan.walker.user.web;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import pnu.busan.walker.user.dto.ChangePasswordRequest;
import pnu.busan.walker.user.dto.MyAccountResponse;
import pnu.busan.walker.user.dto.UpdateProfileRequest;
import pnu.busan.walker.user.dto.UpdateStatusRequest;
import pnu.busan.walker.user.service.MyAccountService;

import static org.springframework.http.MediaType.APPLICATION_JSON_VALUE;

/**
 * 마이페이지 - 내 계정 관리 컨트롤러
 * 경로: /api/v1/me
 */
@RestController
@RequestMapping(path = "/api/v1/me", produces = APPLICATION_JSON_VALUE)
@RequiredArgsConstructor
@Validated
public class MyAccountController {
	
	private final MyAccountService myAccountService;
	
	/* 내 정보 조회 */
	@GetMapping
	public MyAccountResponse getMyAccount(@AuthenticationPrincipal Jwt jwt) {
		Long userId = Long.parseLong(jwt.getSubject());
		return myAccountService.getProfile(userId);
	}
	
	/* 표시 이름 수정 */
	@PatchMapping(consumes = APPLICATION_JSON_VALUE)
	public MyAccountResponse updateProfile(
			@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody UpdateProfileRequest request
	) {
		Long userId = Long.parseLong(jwt.getSubject());
		return myAccountService.updateProfile(userId, request);
	}
	
	/* 비밀번호 변경 */
	@PostMapping(path = "/password", consumes = APPLICATION_JSON_VALUE)
	public void changePassword(
			@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody ChangePasswordRequest request
	) {
		Long userId = Long.parseLong(jwt.getSubject());
		myAccountService.changePassword(userId, request);
	}
	
	/* 계정 활성/비활성 상태 변경 */
	@PatchMapping(path = "/status", consumes = APPLICATION_JSON_VALUE)
	public MyAccountResponse updateStatus(
			@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody UpdateStatusRequest request
	) {
		Long userId = Long.parseLong(jwt.getSubject());
		return myAccountService.updateStatus(userId, request);
	}

}
