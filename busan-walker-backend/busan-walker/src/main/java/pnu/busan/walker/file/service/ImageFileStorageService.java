package pnu.busan.walker.file.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import pnu.busan.walker.common.error.exception.BadRequestException;
import pnu.busan.walker.common.error.exception.InternalServerException;
import pnu.busan.walker.file.config.FileStorageProperties;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ImageFileStorageService {

	private static final String STORAGE_PROVIDER_S3 = "s3";
	private static final String DEFAULT_SCOPE = "reviews";
	private static final Map<String, String> CONTENT_TYPE_TO_EXTENSION = Map.of(
			"image/jpeg", "jpg",
			"image/png", "png",
			"image/webp", "webp",
			"image/gif", "gif"
	);
	private static final Map<String, String> EXTENSION_TO_CONTENT_TYPE = Map.of(
			"jpg", "image/jpeg",
			"jpeg", "image/jpeg",
			"png", "image/png",
			"webp", "image/webp",
			"gif", "image/gif"
	);

	private final FileStorageProperties properties;
	private volatile S3Client cachedS3Client;

	public StoredImageFile storeImage(MultipartFile file, String scope) {
		if (file == null || file.isEmpty()) {
			throw new BadRequestException("업로드 파일이 비어 있습니다.");
		}

		byte[] bytes = readBytes(file);
		String originalFilename = file.getOriginalFilename();
		String contentType = normalizeContentType(detectContentType(file.getContentType(), originalFilename));
		return storeValidatedImage(bytes, originalFilename, contentType, scope);
	}

	public StoredImageFile storeImage(Path filePath, String scope) {
		if (filePath == null) {
			throw new BadRequestException("업로드 파일 경로가 비어 있습니다.");
		}

		Path normalizedPath = filePath.toAbsolutePath().normalize();
		if (!Files.isRegularFile(normalizedPath)) {
			throw new BadRequestException("이미지 파일을 찾을 수 없습니다. path=" + normalizedPath);
		}

		byte[] bytes = readBytes(normalizedPath);
		String originalFilename = normalizedPath.getFileName().toString();
		String contentType = normalizeContentType(detectContentType(normalizedPath, originalFilename));
		return storeValidatedImage(bytes, originalFilename, contentType, scope);
	}

	public void deleteByObjectKey(String objectKey) {
		if (!StringUtils.hasText(objectKey)) {
			return;
		}

		if (useS3()) {
			deleteFromS3(objectKey);
			return;
		}

		Path targetPath = resolveObjectPath(objectKey);
		try {
			Files.deleteIfExists(targetPath);
		} catch (IOException ignored) {
			// Ignore cleanup failure because it should not fail the main request.
		}
	}

	public void deleteByPublicUrl(String publicUrl) {
		String objectKey = extractObjectKey(publicUrl);
		if (!StringUtils.hasText(objectKey)) {
			return;
		}
		deleteByObjectKey(objectKey);
	}

	private byte[] readBytes(MultipartFile file) {
		try {
			return file.getBytes();
		} catch (IOException e) {
			throw new InternalServerException("업로드 파일을 읽을 수 없습니다.");
		}
	}

	private byte[] readBytes(Path filePath) {
		try {
			return Files.readAllBytes(filePath);
		} catch (IOException e) {
			throw new InternalServerException("업로드 파일을 읽을 수 없습니다.");
		}
	}

	private StoredImageFile storeValidatedImage(
			byte[] bytes,
			String originalFilename,
			String contentType,
			String scope
	) {
		validateSize(bytes.length);
		validateContentType(contentType);
		validateImageBytes(bytes);

		String extension = resolveExtension(originalFilename, contentType);
		String objectKey = buildObjectKey(scope, extension);

		if (useS3()) {
			storeToS3(objectKey, bytes, contentType);
			return new StoredImageFile(objectKey, toPublicUrl(objectKey));
		}

		Path targetPath = resolveObjectPath(objectKey);
		try {
			Files.createDirectories(targetPath.getParent());
			Files.write(targetPath, bytes, StandardOpenOption.CREATE_NEW);
		} catch (IOException e) {
			throw new InternalServerException("파일 저장에 실패했습니다.");
		}

		return new StoredImageFile(objectKey, toPublicUrl(objectKey));
	}

	private void validateSize(int byteLength) {
		long maxBytes = Math.max(1L, properties.getMaxBytes());
		if (byteLength > maxBytes) {
			throw new BadRequestException("파일 크기 제한을 초과했습니다.");
		}
	}

	private String normalizeContentType(String contentType) {
		if (!StringUtils.hasText(contentType)) {
			return "";
		}
		return contentType.trim().toLowerCase(Locale.ROOT);
	}

	private String detectContentType(String contentType, String originalFilename) {
		String normalized = normalizeContentType(contentType);
		if (StringUtils.hasText(normalized)) {
			return normalized;
		}

		String extension = normalizeExtension(StringUtils.getFilenameExtension(originalFilename));
		return EXTENSION_TO_CONTENT_TYPE.getOrDefault(extension, "");
	}

	private String detectContentType(Path filePath, String originalFilename) {
		try {
			return detectContentType(Files.probeContentType(filePath), originalFilename);
		} catch (IOException ignored) {
			return detectContentType((String) null, originalFilename);
		}
	}

	private void validateContentType(String contentType) {
		if (!StringUtils.hasText(contentType)) {
			throw new BadRequestException("Content-Type이 비어 있습니다.");
		}

		boolean allowed = properties.getAllowedContentTypes().stream()
				.map(this::normalizeContentType)
				.anyMatch(contentType::equals);

		if (!allowed) {
			throw new BadRequestException("허용되지 않는 이미지 타입입니다.");
		}
	}

	private void validateImageBytes(byte[] bytes) {
		try (ByteArrayInputStream inputStream = new ByteArrayInputStream(bytes)) {
			if (ImageIO.read(inputStream) == null) {
				throw new BadRequestException("이미지 파일이 아닙니다.");
			}
		} catch (IOException e) {
			throw new BadRequestException("이미지 파일 검증에 실패했습니다.");
		}
	}

	private String resolveExtension(String originalFilename, String contentType) {
		String fromContentType = CONTENT_TYPE_TO_EXTENSION.get(contentType);
		if (StringUtils.hasText(fromContentType)) {
			return fromContentType;
		}

		String extension = normalizeExtension(StringUtils.getFilenameExtension(originalFilename));
		if (StringUtils.hasText(extension)) {
			return extension;
		}
		return "bin";
	}

	private String normalizeExtension(String extension) {
		if (!StringUtils.hasText(extension)) {
			return "";
		}
		return extension.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
	}

	private String buildObjectKey(String scope, String extension) {
		String normalizedScope = normalizeRequiredScope(scope);
		LocalDate now = LocalDate.now();
		String uuid = UUID.randomUUID().toString().replace("-", "");
		String key = "%s/%04d/%02d/%02d/%s.%s".formatted(
				normalizedScope,
				now.getYear(),
				now.getMonthValue(),
				now.getDayOfMonth(),
				uuid,
				extension
		);

		if (!useS3()) {
			return key;
		}

		String prefix = normalizeOptionalScope(properties.getS3KeyPrefix());
		if (!StringUtils.hasText(prefix)) {
			return key;
		}
		return prefix + "/" + key;
	}

	private String normalizeRequiredScope(String scope) {
		String normalized = normalizeOptionalScope(scope);
		return StringUtils.hasText(normalized) ? normalized : DEFAULT_SCOPE;
	}

	private String normalizeOptionalScope(String scope) {
		if (!StringUtils.hasText(scope)) {
			return "";
		}

		String[] segments = scope.replace("\\", "/").split("/");
		StringBuilder result = new StringBuilder();
		for (String segment : segments) {
			if (!StringUtils.hasText(segment)) {
				continue;
			}
			String safe = segment.replaceAll("[^A-Za-z0-9._-]", "-");
			if (safe.isBlank()) {
				continue;
			}
			if (result.length() > 0) {
				result.append('/');
			}
			result.append(safe);
		}
		return result.toString();
	}

	private Path resolveObjectPath(String objectKey) {
		Path root = Paths.get(properties.getLocalBaseDir()).toAbsolutePath().normalize();
		String relative = objectKey.replace("\\", "/");
		Path target = root.resolve(relative).normalize();
		if (!target.startsWith(root)) {
			throw new BadRequestException("잘못된 파일 경로입니다.");
		}
		return target;
	}

	private String toPublicUrl(String objectKey) {
		String normalizedKey = objectKey.replace("\\", "/");
		String baseUrl = trimTrailingSlash(properties.getPublicBaseUrl());
		if (StringUtils.hasText(baseUrl)) {
			return baseUrl + "/" + normalizedKey;
		}

		if (useS3()) {
			String bucket = requireText(properties.getS3Bucket(), "S3 bucket 설정이 필요합니다.");
			String region = requireText(properties.getS3Region(), "S3 region 설정이 필요합니다.");
			return "https://%s.s3.%s.amazonaws.com/%s".formatted(bucket, region, normalizedKey);
		}

		String prefix = normalizePublicPrefix(properties.getPublicPathPrefix());
		return prefix + "/" + normalizedKey;
	}

	private String extractObjectKey(String publicUrl) {
		if (!StringUtils.hasText(publicUrl)) {
			return null;
		}

		String normalizedUrl = publicUrl.trim();
		String baseUrl = trimTrailingSlash(properties.getPublicBaseUrl());
		if (StringUtils.hasText(baseUrl) && normalizedUrl.startsWith(baseUrl + "/")) {
			return normalizedUrl.substring(baseUrl.length() + 1);
		}

		if (useS3()) {
			if (normalizedUrl.startsWith("http://") || normalizedUrl.startsWith("https://")) {
				try {
					URI uri = URI.create(normalizedUrl);
					if (!isOwnedS3Host(uri.getHost())) {
						return null;
					}
					String path = uri.getPath();
					return path.startsWith("/") ? path.substring(1) : path;
				} catch (IllegalArgumentException ignored) {
					return null;
				}
			}
			return normalizedUrl.startsWith("/") ? normalizedUrl.substring(1) : normalizedUrl;
		}

		String path = normalizedUrl;
		if (normalizedUrl.startsWith("http://") || normalizedUrl.startsWith("https://")) {
			try {
				path = URI.create(normalizedUrl).getPath();
			} catch (IllegalArgumentException ignored) {
				return null;
			}
		}

		String prefix = normalizePublicPrefix(properties.getPublicPathPrefix());
		String marker = prefix + "/";
		if (!path.startsWith(marker)) {
			return null;
		}
		return path.substring(marker.length());
	}

	private String normalizePublicPrefix(String publicPathPrefix) {
		String prefix = StringUtils.hasText(publicPathPrefix) ? publicPathPrefix.trim() : "/uploads";
		if (!prefix.startsWith("/")) {
			prefix = "/" + prefix;
		}
		return trimTrailingSlash(prefix);
	}

	private String trimTrailingSlash(String value) {
		if (!StringUtils.hasText(value)) {
			return "";
		}
		String result = value.trim();
		while (result.endsWith("/")) {
			result = result.substring(0, result.length() - 1);
		}
		return result;
	}

	private boolean useS3() {
		String provider = properties.getProvider();
		return STORAGE_PROVIDER_S3.equalsIgnoreCase(provider);
	}

	private boolean isOwnedS3Host(String host) {
		if (!StringUtils.hasText(host)) {
			return false;
		}

		String normalizedHost = host.trim().toLowerCase(Locale.ROOT);
		String bucket = requireText(properties.getS3Bucket(), "S3 bucket 설정이 필요합니다.").toLowerCase(Locale.ROOT);
		String region = requireText(properties.getS3Region(), "S3 region 설정이 필요합니다.").toLowerCase(Locale.ROOT);

		String expectedRegional = ("%s.s3.%s.amazonaws.com").formatted(bucket, region);
		String expectedLegacy = ("%s.s3.amazonaws.com").formatted(bucket);

		return normalizedHost.equals(expectedRegional) || normalizedHost.equals(expectedLegacy);
	}

	private void storeToS3(String objectKey, byte[] bytes, String contentType) {
		String bucket = requireText(properties.getS3Bucket(), "S3 bucket 설정이 필요합니다.");
		try {
			PutObjectRequest request = PutObjectRequest.builder()
					.bucket(bucket)
					.key(objectKey)
					.contentType(contentType)
					.cacheControl("public, max-age=31536000, immutable")
					.build();

			s3Client().putObject(request, RequestBody.fromBytes(bytes));
		} catch (S3Exception e) {
			throw new InternalServerException("S3 업로드에 실패했습니다.");
		}
	}

	private void deleteFromS3(String objectKey) {
		String bucket = requireText(properties.getS3Bucket(), "S3 bucket 설정이 필요합니다.");
		try {
			DeleteObjectRequest request = DeleteObjectRequest.builder()
					.bucket(bucket)
					.key(objectKey)
					.build();
			s3Client().deleteObject(request);
		} catch (S3Exception ignored) {
			// Ignore cleanup failure because it should not fail the main request.
		}
	}

	private S3Client s3Client() {
		S3Client existing = cachedS3Client;
		if (existing != null) {
			return existing;
		}

		synchronized (this) {
			if (cachedS3Client != null) {
				return cachedS3Client;
			}
			String regionName = requireText(properties.getS3Region(), "S3 region 설정이 필요합니다.");
			S3ClientBuilder builder = S3Client.builder()
					.region(Region.of(regionName));

			String keyId = properties.getS3AccessKeyId();
			String secretKey = properties.getS3SecretAccessKey();
			if (StringUtils.hasText(keyId) && StringUtils.hasText(secretKey)) {
				builder.credentialsProvider(
						StaticCredentialsProvider.create(
								AwsBasicCredentials.create(keyId, secretKey)));
			} else {
				builder.credentialsProvider(DefaultCredentialsProvider.create());
			}

			cachedS3Client = builder.build();
			return cachedS3Client;
		}
	}

	private String requireText(String value, String message) {
		if (!StringUtils.hasText(value)) {
			throw new InternalServerException(message);
		}
		return value.trim();
	}

}
