package pnu.busan.walker.attraction.dto;

/**
 * 소개 페이지용 카드 DTO (스토리/카테고리 등)
 * - 필요 시 sotrySummary는 "미리보기"로 줄여서 내려줌
 */
public record AttractionIntroCardResponse(
        String keyId,
        String placeName,
        String address,
        String imageUrl,
        String categoryName,
        String storyTitle,
        String storySummary,
        String storyUrl,
        String coreKeywords
) {}
