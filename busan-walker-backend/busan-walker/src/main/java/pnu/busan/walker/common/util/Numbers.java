package pnu.busan.walker.common.util;

import java.math.BigDecimal;
import java.math.BigInteger;

/**
 * DB/Driver가 반환하는 Number 타입을 Integer로 안정 변환
 * - null은 null로 유지
 * - Long/BigInteger/BigDecimal 등도 예외 없이 처리
 */
public final class Numbers {

    private Numbers() {}

    public static Integer toInt(Number n) {
        return switch (n) {
            case null -> null;
            case Integer i -> i;
            case Long l -> Math.toIntExact(l);
            case BigInteger bi -> bi.intValueExact();
            case BigDecimal bd -> bd.intValueExact();
            default ->

                /* Double/Float 등: 값이 정수라는 전제(CEILING 기반) 하에 intValue 사용 */
                    n.intValue();
        };

    }

}
