package pnu.busan.walker.user.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pnu.busan.walker.auth.repository.RefreshTokenRepository;
import pnu.busan.walker.common.error.exception.BadRequestException;
import pnu.busan.walker.common.error.exception.NotFoundException;
import pnu.busan.walker.user.domain.AccountStatus;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.dto.ChangePasswordRequest;
import pnu.busan.walker.user.dto.MyAccountResponse;
import pnu.busan.walker.user.dto.UpdateProfileRequest;
import pnu.busan.walker.user.dto.UpdateStatusRequest;
import pnu.busan.walker.user.repository.UserRepository;

import java.time.Clock;
import java.time.Instant;

/**
 * 마이페이지 - 내 계정 관리 서비스
 */
@Service
@RequiredArgsConstructor
public class MyAccountService {

	private final UserRepository userRepo;
	private final RefreshTokenRepository refreshTokenRepo;
	private final PasswordEncoder encoder;
	private final Clock clock;
	
	/* 내 정보 조회 */
	@Transactional(readOnly = true)
	public MyAccountResponse getProfile(Long userId) {
		User u = userRepo.findById(userId).orElseThrow(() -> new NotFoundException("User not found: id=" + userId));
		
		return MyAccountResponse.from(u);
	}
	
	/* 표시 이름 수정 */
	@Transactional
	public MyAccountResponse updateProfile(Long userId, UpdateProfileRequest request) {
		User u = userRepo.findById(userId).orElseThrow(() -> new NotFoundException("User not found: id=" + userId));
		
		/* 앞뒤 공백 제거 후 저장 */
		u.setDisplayName(request.displayName().trim());
		
		return MyAccountResponse.from(u);
	}
	
	/* 비밀번호 변경 */
	@Transactional
	public void changePassword(Long userId, ChangePasswordRequest request) {
		User u = userRepo.findById(userId).orElseThrow(() -> new NotFoundException("사용자를 찾을 수 없습니다. id=" + userId));
		
		/* 소셜 로그인 등 비밀번호가 없는 계정은 변경 불가 */
		if (u.getPasswordHash() == null) {
			throw new BadRequestException("이 계정은 비밀번호 로그인을 사용할 수 없습니다.");
		}
		
		/* 현재 비밀번호 검증 */
		if (!encoder.matches(request.currentPassword(), u.getPasswordHash())) {
			throw new BadRequestException("현재 비밀번호가 올바르지 않습니다.");
		}
		
		/* 새 비밀번호가 기존 비밀번호와 동일한지 검사 */
		if (encoder.matches(request.newPassword(), u.getPasswordHash())) {
			throw new BadRequestException("이전과 동일한 비밀번호는 사용할 수 업습니다.");
		}
		
		/* 새 비밀번호 저장 */
		u.setPasswordHash(encoder.encode(request.newPassword()));
		
		/* 비밀번호 변경 시, 모든 refresh 토큰 세션 종료 (보안 강화) */
		Instant now = Instant.now(clock);
		refreshTokenRepo.revokeAllByUser(u, now);
	}
	
	/* 계정 활성/비활성 상태 변경 */
	@Transactional
	public MyAccountResponse updateStatus(Long userId, UpdateStatusRequest request) {
		User u = userRepo.findById(userId).orElseThrow(() -> new NotFoundException("User not found: id=" + userId));
		
		boolean newActive = Boolean.TRUE.equals(request.active());
		
		if (newActive) {
			/* (1) 사용자가 직접 비활성화한 경우만 재활성 허용 */
			if (u.getStatus() == AccountStatus.DISABLED_BY_USER) {
				u.reactivate();
			} else {
				/* ADMIN 에 의해 비활성화된 경우, 사용자에서 재활성 금지 */
				throw new BadRequestException("This account cannot be reactivated by user");
			}
		} else {
			/* (2) 사용자 요청에 의한 비활성화 */
			u.deactivateByUser();
			
			/* refresh 토큰 세션 종료 */
			Instant now = Instant.now(clock);
			refreshTokenRepo.revokeAllByUser(u, now);
		}
		
		return MyAccountResponse.from(u);
	}
	
}
