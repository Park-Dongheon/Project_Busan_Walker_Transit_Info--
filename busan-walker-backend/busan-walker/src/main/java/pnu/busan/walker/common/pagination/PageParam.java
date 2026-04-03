package pnu.busan.walker.common.pagination;

import jakarta.validation.constraints.Min;
import lombok.Builder;
import lombok.Getter;
import lombok.ToString;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import pnu.busan.walker.common.util.Sorts;

import java.util.Set;

import static pnu.busan.walker.common.Constants.PAGE_DEFAULT_SIZE;
import static pnu.busan.walker.common.Constants.PAGE_MAX_SIZE;

/**
 * 공통 페이지 파라미터 DTO
 * - page(0..), size(1..PAGE_MAX_SIZE), sort("field,asc|desc")
 * - 컨트롤러에서 @Validated로 검증 후 사용
 */
@Getter
@ToString
public class PageParam {

	@Min(0)
	private final int page;

	@Min(1)
	private final int size;

	/* ex: "placeName,asc" */
	private final String sort;

	@Builder
	public PageParam(Integer page, Integer size, String sort) {
		this.page = page == null ? 0 : Math.max(0, page);
		int s = size == null ? PAGE_DEFAULT_SIZE : size;
		this.size = Math.min(Math.max(1, s), PAGE_MAX_SIZE);
		this.sort = sort;
	}

	public Pageable toPageable(Set<String> sortWhitelist, Sort defaultSort) {
		Sort s = Sorts.parseAndValidate(this.sort, sortWhitelist, defaultSort);

		return PageRequest.of(this.page, this.size, s);
	}

}