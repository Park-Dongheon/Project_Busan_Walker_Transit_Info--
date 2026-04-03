package pnu.busan.walker.favorite.service;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pnu.busan.walker.attraction.domain.Attraction;
import pnu.busan.walker.attraction.dto.AttractionCardResponse;
import pnu.busan.walker.attraction.repository.AttractionRepository;
import pnu.busan.walker.common.error.exception.NotFoundException;
import pnu.busan.walker.common.pagination.ApiPage;
import pnu.busan.walker.common.pagination.PageParam;
import pnu.busan.walker.common.util.Numbers;
import pnu.busan.walker.favorite.domain.UserFavorite;
import pnu.busan.walker.favorite.domain.UserFavoriteId;
import pnu.busan.walker.favorite.repository.UserFavoriteRepository;
import pnu.busan.walker.favorite.repository.UserFavoriteRepository.FavoriteCardProjection;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.repository.UserRepository;

import java.util.Set;

/**
 * 즐겨찾기 서비스
 */
@Service
@RequiredArgsConstructor
@Transactional
public class FavoriteService {

	private final UserRepository userRepo;
	private final AttractionRepository attractionRepo;
	private final UserFavoriteRepository favoriteRepo;
	
	/**
	 * 즐겨찾기 추가
	 * - DB PK(user_id, keyid) 제약으로 중복이 방지되며, 중복 요청은 무시
	 */
	public void addFavorite(long userId, String keyId) {
		User user = getUser(userId);
		Attraction attraction = getAttraction(keyId);
		
		UserFavoriteId id = UserFavoriteId.builder()
				.userId(user.getId())
				.keyId(attraction.getKeyId())
				.build();
		
		UserFavorite fav = UserFavorite.builder()
				.id(id)
				.user(user)
				.attraction(attraction)
				.build();
		
		/* 동시성 상황에서도 PK 중복을 DB가 최종 차단 */
		try {
			favoriteRepo.saveAndFlush(fav);
		} catch (DataIntegrityViolationException ignored) {
			/* 이미 즐겨찾기인 경우 */
		}
	}
	
	/**
	 * 즐겨찾기 제거
	 * - 대상이 없어도 API는 idempotent하게 동작
	 */
	public void removeFavorite(Long userId, String keyId) {
		UserFavoriteId id = UserFavoriteId.builder()
				.userId(userId)
				.keyId(keyId)
				.build();
		
		try {
			favoriteRepo.deleteById(id);
		} catch (EmptyResultDataAccessException ignored) {
			/* 이미 삭제된 경우 */
		}
	}

	@Transactional(readOnly = true)
	public boolean existsFavorite(long userId, String keyId) {
		UserFavoriteId id = UserFavoriteId.builder()
				.userId(userId)
				.keyId(keyId)
				.build();
		return favoriteRepo.existsById(id);
	}
	
	/**
	 * 즐겨찾기 목록 (카드 리스트)
	 * - vw_user_favorites_detail 기반으로 페이지 조회 후 AttractionCardResponse로 변환
	 */
	@Transactional(readOnly = true)
	public ApiPage<AttractionCardResponse> listFavorites(long userId, PageParam param) {
		/* 정렬 화이트리스트 및 기본 정렬 */
		Set<String> sortWhitelist = Set.of("placeName", "avgRating", "totalAccess", "favoredAt", "keyId");

		Sort defaultSort = Sort.by(
			Sort.Order.desc("favoredAt"),
			Sort.Order.desc("avgRating"),
			Sort.Order.asc("keyId")
		);
		
		Pageable pageable = param.toPageable(sortWhitelist, defaultSort);
		
		Page<FavoriteCardProjection> page = favoriteRepo.findFavoriteCardsByUserId(userId, pageable);

		return ApiPage.from(page.map(this::toCardResponse));
	}

	/* ========================
	   내부 유틸
	   ======================== */
	
	private User getUser(long userId) {
		return userRepo.findById(userId).orElseThrow(() -> new NotFoundException("User not found: id=" + userId));
	}
	
	private Attraction getAttraction(String attractionId) {
		/* Attraction 엔티티의 PK는 keyId (String) 기준 */
		return attractionRepo.findByKeyId(attractionId).orElseThrow(() -> new NotFoundException("Attraction not found: keyId=" + attractionId));
	}
	
	private AttractionCardResponse toCardResponse(FavoriteCardProjection p) {
		return new AttractionCardResponse(
				p.getKeyId(),
				p.getPlaceName(),
				p.getAddress(),
				p.getImageUrl(),
				p.getLatitude(),
				p.getLongitude(),
				Numbers.toInt(p.getReviewCount()),
				p.getAvgRating(),
				Numbers.toInt(p.getTotalAccess()),
				p.getNearestModeCode(),
				p.getNearestModeName(),

				/* 보조 필드: m */
				p.getNearestDistanceM(),

				/* 프론트 계약: Km */
				p.getNearestDistanceKm(),

				Numbers.toInt(p.getNearestWalkMin())
		);
	}
	
}
