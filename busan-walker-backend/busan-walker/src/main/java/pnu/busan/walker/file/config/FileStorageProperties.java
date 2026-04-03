package pnu.busan.walker.file.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app.file")
public class FileStorageProperties {

	private String provider = "local";

	private String localBaseDir = "./uploads";
	private String publicPathPrefix = "/uploads";
	private String publicBaseUrl = "";

	private String s3Bucket = "";
	private String s3Region = "ap-northeast-2";
	private String s3KeyPrefix = "";
	private String s3AccessKeyId = "";
	private String s3SecretAccessKey = "";

	private long maxBytes = 5L * 1024L * 1024L;
	private List<String> allowedContentTypes = new ArrayList<>(List.of(
			"image/jpeg",
			"image/png",
			"image/webp",
			"image/gif"
	));

}
