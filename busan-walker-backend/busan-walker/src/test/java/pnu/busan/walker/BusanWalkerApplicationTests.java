package pnu.busan.walker;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;

@EnabledIfEnvironmentVariable(named = "BH_DB_URL", matches = ".+")
@SpringBootTest
class BusanWalkerApplicationTests {

	@Test
	void contextLoads() {
	}

}
