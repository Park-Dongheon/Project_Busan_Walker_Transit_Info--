package pnu.busan.walker.attraction.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import pnu.busan.walker.attraction.domain.Attraction;
import pnu.busan.walker.attraction.repository.AttractionRepository;
import pnu.busan.walker.common.error.exception.BadRequestException;
import pnu.busan.walker.common.error.exception.NotFoundException;
import pnu.busan.walker.file.service.ImageFileStorageService;
import pnu.busan.walker.file.service.StoredImageFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class AttractionImageBatchImportService {

	private static final Pattern KEY_ID_PREFIX_PATTERN = Pattern.compile("^(\\d+)[_-].+");

	private final AttractionRepository attractionRepository;
	private final ImageFileStorageService imageFileStorageService;

	public BatchImportResult importFromDirectory(Path imageDir, boolean overwriteExisting) {
		Path normalizedImageDir = validateDirectory(imageDir);
		List<Path> files = listImageFiles(normalizedImageDir);
		ResolvedMappings resolvedMappings = resolveMappings(files);

		int uploadedCount = 0;
		int skippedCount = 0;
		List<BatchImportFailure> failures = new ArrayList<>(resolvedMappings.failures());

		for (ImageMapping mapping : resolvedMappings.mappings()) {
			try {
				ImportOutcome outcome = importSingle(mapping, overwriteExisting);
				if (outcome == ImportOutcome.UPLOADED) {
					uploadedCount++;
				} else {
					skippedCount++;
				}
			} catch (RuntimeException e) {
				failures.add(new BatchImportFailure(
						mapping.keyId(),
						mapping.fileName(),
						e.getMessage()
				));
			}
		}

		return new BatchImportResult(
				normalizedImageDir,
				files.size(),
				resolvedMappings.mappings().size(),
				uploadedCount,
				skippedCount,
				List.copyOf(failures)
		);
	}

	private ImportOutcome importSingle(ImageMapping mapping, boolean overwriteExisting) {
		Attraction attraction = attractionRepository.findById(mapping.keyId())
				.orElseThrow(() -> new NotFoundException("Attraction not found. keyId=" + mapping.keyId()));

		String previousImageUrl = attraction.getImageUrl();
		if (StringUtils.hasText(previousImageUrl) && !overwriteExisting) {
			return ImportOutcome.SKIPPED_EXISTING;
		}

		String scope = "attractions/" + sanitizeScopeSegment(mapping.keyId()) + "/cover";
		StoredImageFile stored = imageFileStorageService.storeImage(mapping.filePath(), scope);

		try {
			attraction.setImageUrl(stored.publicUrl());
			attractionRepository.save(attraction);
		} catch (RuntimeException e) {
			imageFileStorageService.deleteByObjectKey(stored.objectKey());
			throw e;
		}

		imageFileStorageService.deleteByPublicUrl(previousImageUrl);
		return ImportOutcome.UPLOADED;
	}

	private Path validateDirectory(Path imageDir) {
		if (imageDir == null) {
			throw new BadRequestException("Image directory path is required.");
		}

		Path normalized = imageDir.toAbsolutePath().normalize();
		if (!Files.isDirectory(normalized)) {
			throw new BadRequestException("Image directory not found. path=" + normalized);
		}
		return normalized;
	}

	private List<Path> listImageFiles(Path imageDir) {
		try (var stream = Files.list(imageDir)) {
			List<Path> files = stream
					.filter(Files::isRegularFile)
					.sorted(Comparator.comparing(path -> path.getFileName().toString(), String.CASE_INSENSITIVE_ORDER))
					.toList();
			if (files.isEmpty()) {
				throw new BadRequestException("No image files found in directory. path=" + imageDir);
			}
			return files;
		} catch (IOException e) {
			throw new BadRequestException("Failed to read image directory. path=" + imageDir);
		}
	}

	private ResolvedMappings resolveMappings(List<Path> files) {
		List<BatchImportFailure> failures = new ArrayList<>();
		List<ImageMapping> parsedMappings = new ArrayList<>();

		for (Path file : files) {
			String fileName = file.getFileName().toString();
			Matcher matcher = KEY_ID_PREFIX_PATTERN.matcher(fileName);
			if (!matcher.matches()) {
				failures.add(new BatchImportFailure(
						null,
						fileName,
						"Filename must start with '<keyId>_' or '<keyId>-'."
				));
				continue;
			}

			parsedMappings.add(new ImageMapping(
					matcher.group(1),
					fileName,
					file
			));
		}

		Map<String, List<ImageMapping>> mappingsByKeyId = new LinkedHashMap<>();
		for (ImageMapping mapping : parsedMappings) {
			mappingsByKeyId.computeIfAbsent(mapping.keyId(), ignored -> new ArrayList<>()).add(mapping);
		}

		List<ImageMapping> uniqueMappings = new ArrayList<>();
		for (Map.Entry<String, List<ImageMapping>> entry : mappingsByKeyId.entrySet()) {
			List<ImageMapping> mappings = entry.getValue();
			if (mappings.size() == 1) {
				uniqueMappings.add(mappings.get(0));
				continue;
			}

			for (ImageMapping mapping : mappings) {
				failures.add(new BatchImportFailure(
						mapping.keyId(),
						mapping.fileName(),
						"Duplicate keyId prefix detected in directory."
				));
			}
		}

		return new ResolvedMappings(List.copyOf(uniqueMappings), List.copyOf(failures));
	}

	private String sanitizeScopeSegment(String value) {
		return value.replaceAll("[^A-Za-z0-9._-]", "-");
	}

	private enum ImportOutcome {
		UPLOADED,
		SKIPPED_EXISTING
	}

	private record ResolvedMappings(
			List<ImageMapping> mappings,
			List<BatchImportFailure> failures
	) {}

	private record ImageMapping(
			String keyId,
			String fileName,
			Path filePath
	) {}

	public record BatchImportResult(
			Path imageDir,
			int scannedFileCount,
			int matchedFileCount,
			int uploadedCount,
			int skippedCount,
			List<BatchImportFailure> failures
	) {
		public int failureCount() {
			return failures.size();
		}

		public boolean hasFailures() {
			return !failures.isEmpty();
		}
	}

	public record BatchImportFailure(
			String keyId,
			String fileName,
			String message
	) {}

}
