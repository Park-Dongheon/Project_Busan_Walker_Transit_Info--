package pnu.busan.walker.common;

import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 공통 상수 모음
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Constants {

	/* 페이지 크기 상한(실무 권장: 200) */
	public static final int PAGE_MAX_SIZE = 200;

	/* 페이지 기본 크기(기본 20) */
	public static final int PAGE_DEFAULT_SIZE = 20;

}
