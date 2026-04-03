package pnu.busan.walker.attraction.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import pnu.busan.walker.attraction.domain.Attraction;
import pnu.busan.walker.attraction.repository.AttractionRepository;
import pnu.busan.walker.common.error.exception.NotFoundException;
import pnu.busan.walker.file.service.ImageFileStorageService;
import pnu.busan.walker.file.service.StoredImageFile;

@Service
@RequiredArgsConstructor
public class AttractionImageAdminService {

	private final AttractionRepository attractionRepository;
	private final ImageFileStorageService imageFileStorageService;

	@Transactional
	public AttractionImageUploadResponse uploadCoverImage(String keyId, MultipartFile file) {
		Attraction attraction = attractionRepository.findById(keyId)
				.orElseThrow(() -> new NotFoundException("관광지를 찾을 수 없습니다. keyId=" + keyId));

		String scope = "attractions/" + sanitizeScopeSegment(keyId) + "/cover";
		StoredImageFile stored = imageFileStorageService.storeImage(file, scope);
		String previousImageUrl = attraction.getImageUrl();

		try {
			attraction.setImageUrl(stored.publicUrl());
			attractionRepository.save(attraction);
		} catch (RuntimeException e) {
			imageFileStorageService.deleteByObjectKey(stored.objectKey());
			throw e;
		}

		imageFileStorageService.deleteByPublicUrl(previousImageUrl);
		return new AttractionImageUploadResponse(attraction.getKeyId(), attraction.getImageUrl());
	}

	private String sanitizeScopeSegment(String value) {
		return value.replaceAll("[^A-Za-z0-9._-]", "-");
	}

	public record AttractionImageUploadResponse(
			String keyId,
			String imageUrl
	) {}

}

