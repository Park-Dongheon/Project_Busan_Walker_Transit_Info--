package pnu.busan.walker.attraction.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import pnu.busan.walker.config.AttractionImageImportProperties;
import pnu.busan.walker.file.config.FileStorageProperties;

import java.nio.file.Path;

@Slf4j
@Component
@RequiredArgsConstructor
public class AttractionImageBatchImportRunner implements ApplicationRunner {

	private static final String STORAGE_PROVIDER_S3 = "s3";

	private final AttractionImageImportProperties properties;
	private final FileStorageProperties fileStorageProperties;
	private final AttractionImageBatchImportService attractionImageBatchImportService;
	private final ConfigurableApplicationContext applicationContext;

	@Override
	public void run(ApplicationArguments args) {
		if (!properties.isEnabled()) {
			return;
		}

		validateRequiredPaths();
		logImportConfiguration();

		AttractionImageBatchImportService.BatchImportResult result =
				attractionImageBatchImportService.importFromDirectory(
						Path.of(properties.getImageDir()),
						properties.isOverwriteExisting()
				);

		log.info(
				"Attraction image import completed. scanned={}, matched={}, uploaded={}, skipped={}, failed={}",
				result.scannedFileCount(),
				result.matchedFileCount(),
				result.uploadedCount(),
				result.skippedCount(),
				result.failureCount()
		);

		for (AttractionImageBatchImportService.BatchImportFailure failure : result.failures()) {
			log.error(
					"Attraction image import failure. keyId={}, fileName={}, message={}",
					failure.keyId(),
					failure.fileName(),
					failure.message()
			);
		}

		if (result.hasFailures()) {
			throw new IllegalStateException("Attraction image batch import finished with failures. failed=" + result.failureCount());
		}

		if (properties.isExitAfterRun()) {
			log.info("Attraction image import requested exit-after-run. Closing application context.");
			applicationContext.close();
		}
	}

	private void validateRequiredPaths() {
		if (!StringUtils.hasText(properties.getImageDir())) {
			throw new IllegalStateException("app.attraction-image-import.image-dir setting is required.");
		}
	}

	private void logImportConfiguration() {
		String provider = normalizedProvider();

		log.info(
				"Starting attraction image import. provider={}, imageDir={}, overwriteExisting={}, publicBaseUrl={}, s3Bucket={}, s3Region={}, s3KeyPrefix={}",
				provider,
				properties.getImageDir(),
				properties.isOverwriteExisting(),
				display(fileStorageProperties.getPublicBaseUrl()),
				display(fileStorageProperties.getS3Bucket()),
				display(fileStorageProperties.getS3Region()),
				display(fileStorageProperties.getS3KeyPrefix())
		);

		if (!STORAGE_PROVIDER_S3.equals(provider)) {
			log.warn("Attraction image import is running without S3 provider. This run will not create S3 objects.");
		}

		if (STORAGE_PROVIDER_S3.equals(provider) && !StringUtils.hasText(fileStorageProperties.getPublicBaseUrl())) {
			log.warn("Attraction image import is running in S3 mode without public-base-url. image_url will be stored as raw S3 URLs.");
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
