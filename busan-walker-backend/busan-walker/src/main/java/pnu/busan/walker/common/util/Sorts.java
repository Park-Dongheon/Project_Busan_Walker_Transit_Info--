package pnu.busan.walker.common.util;

import org.springframework.data.domain.Sort;
import pnu.busan.walker.common.error.exception.InvalidSortFieldException;

import java.util.Set;

/**
 * 정렬 화이트리스트 유틸
 * - 허용된 필드만 Sort로 변환
 * - 기본 형식: "field,asc|desc"
 * - 확장 형식: "field:asc,field2:desc"
 */
public final class Sorts {

	private Sorts() {}

	public static Sort parseAndValidate(
			String sortParam,
			Set<String> whitelist,
			Sort defaultSort
	) {
		if (sortParam == null || sortParam.isBlank()) {
			return defaultSort;
		}

		/* 확장 형식: "field:asc,field2:desc" */
		if (sortParam.contains(":")) {
			Sort combined = Sort.unsorted();

			for (String token : sortParam.split(",")) {
				String t = token.trim();
				if (t.isEmpty()) continue;

				String[] parts = t.split(":");
				String field = parts[0].trim();
				String dir = (parts.length >= 2) ? parts[1].trim().toLowerCase() : "asc";

				validateField(field, whitelist);
				combined = combined.and(Sort.by(new Sort.Order(parseDir(dir), field)));
			}

			return combined.isSorted() ? combined : defaultSort;
		};

		/* 기본 형식: "field,asc|desc */
		String[] parts = sortParam.split(",");
		String field = parts[0].trim();
		String dir = (parts.length >= 2) ? parts[1].trim().toLowerCase() : "asc";

		validateField(field, whitelist);
		return Sort.by(new Sort.Order(parseDir(dir), field));
	}

	private static void validateField(String field, Set<String> whitelist) {
		if (!whitelist.contains(field)) {
			throw new InvalidSortFieldException("Invalid sort field: " + field);
		}
	}

	private static Sort.Direction parseDir(String dir) {
		if ("desc".equals(dir)) return Sort.Direction.DESC;
		if ("asc".equals(dir) || dir.isBlank()) return Sort.Direction.ASC;
		throw new InvalidSortFieldException("Invalid sort direction: " + dir);
	}

}
