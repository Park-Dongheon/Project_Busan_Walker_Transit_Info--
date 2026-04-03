package pnu.busan.walker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication
@EnableJpaRepositories(basePackages = "pnu.busan.walker")
@EntityScan(basePackages = "pnu.busan.walker")
@ConfigurationPropertiesScan("pnu.busan.walker.config")
public class BusanWalkerApplication {

	public static void main(String[] args) {
		SpringApplication.run(BusanWalkerApplication.class, args);
	}

}
