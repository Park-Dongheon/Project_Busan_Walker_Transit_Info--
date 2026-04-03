package pnu.busan.walker.review.dto;

import jakarta.validation.constraints.*;

import java.util.List;

/**
 * 리뷰 작성 요청 DTO
 *
 * - rating: 1~5 필수 값
 * - body: 본문(공백 금지, 최대 길이 제한)
 * - imageUrls: 업로드/호스팅된 이미지 URL 목록(최대 10개, 각 URL 길이 제한)
 */
public record ReviewCreateRequest(

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
