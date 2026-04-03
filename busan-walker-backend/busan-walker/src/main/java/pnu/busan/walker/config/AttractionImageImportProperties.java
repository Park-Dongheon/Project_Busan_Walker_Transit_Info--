package pnu.busan.walker.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app.attraction-image-import")
public class AttractionImageImportProperties {

	private boolean enabled = false;
	private String imageDir = "";
	private boolean overwriteExisting = false;
	private boolean exitAfterRun = true;

}
