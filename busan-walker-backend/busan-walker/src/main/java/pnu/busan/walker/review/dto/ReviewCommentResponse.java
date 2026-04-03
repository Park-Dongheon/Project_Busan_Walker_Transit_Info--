package pnu.busan.walker.review.dto;

import java.time.Instant;

/**
 * 댓글 응답 DTO
 *
 * - authorName은 author_name_snapshot을 사용해 "작성 당시 표시 이름"을 안정적으로 노출
 * - authorId는 사용자 탈퇴/정책에 따라 null일 수 있음
 * - hidden: true이면 작성자만 목록에 노출되며, 프론트에서 "숨긴 댓글" 등으로 표시
 */
public record ReviewCommentResponse(
        Long commentId,
        Long authorId,
        String authorName,
        String body,
        Instant createdAt,
        boolean hidden
) {}
