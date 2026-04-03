package pnu.busan.walker.file.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import pnu.busan.walker.config.AttractionImageImportProperties;

@Slf4j
@Component
@RequiredArgsConstructor
public class FileStorageStartupDiagnostics implements ApplicationRunner {

	private static final String STORAGE_PROVIDER_S3 = "s3";

	private final FileStorageProperties fileStorageProperties;
	private final AttractionImageImportProperties attractionImageImportProperties;

	@Override
	public void run(ApplicationArguments args) {
		String provider = normalizedProvider();

		log.info(
				"File storage mode initialized. provider={}, publicBaseUrl={}, localBaseDir={}, s3Bucket={}, s3Region={}, s3KeyPrefix={}",
				provider,
				display(fileStorageProperties.getPublicBaseUrl()),
				display(fileStorageProperties.getLocalBaseDir()),
				display(fileStorageProperties.getS3Bucket()),
				display(fileStorageProperties.getS3Region()),
				display(fileStorageProperties.getS3KeyPrefix())
		);

		log.info(
				"Attraction image import mode. enabled={}, imageDir={}, overwriteExisting={}, exitAfterRun={}",
				attractionImageImportProperties.isEnabled(),
				display(attractionImageImportProperties.getImageDir()),
				attractionImageImportProperties.isOverwriteExisting(),
				attractionImageImportProperties.isExitAfterRun()
		);

		if (!STORAGE_PROVIDER_S3.equals(provider)) {
			log.warn("File storage provider is not S3. Uploaded attraction images will not create S3 objects in the current run.");
		}

		if (STORAGE_PROVIDER_S3.equals(provider) && !StringUtils.hasText(fileStorageProperties.getPublicBaseUrl())) {
			log.warn("S3 mode is active but app.file.public-base-url is empty. DB image_url will use raw S3 URLs instead of CloudFront URLs.");
		}
	}

	private String normalizedProvider() {
		String provider = fileStorageProperties.getProvider();
		return StringUtils.hasText(provider) ? provider.trim().toLowerCase() : "local";
	}

	private String display(String value) {
		return StringUtils.hasText(value) ? value.trim() : "<empty>";
	}
}
