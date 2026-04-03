package pnu.busan.walker.review.dto;

import java.time.Instant;
import java.util.List;

/**
 * 리뷰 목록(카드) 응답 DTO
 *
 * "목록 화면"에서 즉시 렌더링 가능한 최소 정보를 제공
 * - 본문(body), 평점(rating), 작성자(authorName)
 * - 좋아요/댓글 수 집계(likeCount, commentCount)
 * - 현재 사용자 관점 좋아요 여부(likedByMe)
 * - 이미지 URL 목록(imageUrls): 목록에서 N+1을 피하기 위해 배치 조회 후 조립하는 방식을 전제
 */
public record ReviewCardResponse(
        Long reviewId,
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
