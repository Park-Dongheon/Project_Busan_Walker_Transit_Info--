package pnu.busan.walker.review.dto;

import jakarta.validation.constraints.*;

import java.util.List;

/**
 * 리뷰 수정 요청 DTO
 *
 * PUT 의미로 동작하도록 설계
 * - rating/body/imageUrls는 "요청값이 최종 상태"로 간주하고, 서버는 그대로 반영
 * - imageUrls는 전체 교체 방식으로 처리하여 결과를 예측 가능하게 만듬
 */
public record ReviewUpdateRequest(

        @NotNull
        @Min(1)
        @Max(5)
        Integer rating,

        @NotBlank
        @Size(max = 2000)
        String body,

        @Size(max = 10)
        List<@Size(max = 500) String> imageUrls
) {}
