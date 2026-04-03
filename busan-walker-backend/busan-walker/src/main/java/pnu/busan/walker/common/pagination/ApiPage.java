package pnu.busan.walker.common.pagination;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * 표준 페이지 응답 래퍼
 * - Spring Data Page<T> -> JSON으로 내보낼 전용 응답 래퍼
 * - 불변 (record)
 */
public record ApiPage<T>(
	List<T> content,
	int page,
	int size,
	long totalElements,
	int totalPages
) {

	/* Page<T> -> ApiPage<T> 변환용 정적 팩토리 */
	public static <T> ApiPage<T> from(Page<T> p) {
		return new ApiPage<>(
				p.getContent(),
				p.getNumber(),
				p.getSize(),
				p.getTotalElements(),
				p.getTotalPages()
		);
	}

}