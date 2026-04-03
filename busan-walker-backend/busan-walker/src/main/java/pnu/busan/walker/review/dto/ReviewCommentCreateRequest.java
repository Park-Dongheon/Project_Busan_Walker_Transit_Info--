package pnu.busan.walker.review.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 댓글 작성 요청 DTO
 *
 * - body: 댓글 본문
 */
public record ReviewCommentCreateRequest(

        @NotBlank
        @Size(max = 800)
        String body

) {}
