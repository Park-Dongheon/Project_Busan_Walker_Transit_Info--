package pnu.busan.walker.review.dto;

import java.time.Instant;
import java.util.List;

/**
 * 리뷰 상세 응답 DTO
 *
 * - 목록 DTO보다 더 많은 정보를 포함
 * - 댓글은 별도의 API로 페이지네이션 조회하는 구조를 전제
 */
public record ReviewDetailResponse(
        Long reviewId,
        String keyId,
        Long authorId,
        String authorName,
        Integer rating,
        String body,
        boolean likedByMe,
        long likeCount,
        long commentCount,
        List<String> imageUrls,
        Instant createdAt,
        Instant updatedAt
) {}
