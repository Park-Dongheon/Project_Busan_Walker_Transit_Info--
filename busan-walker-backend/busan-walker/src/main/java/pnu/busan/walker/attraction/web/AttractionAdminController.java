package pnu.busan.walker.attraction.web;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import pnu.busan.walker.attraction.service.AttractionImageAdminService;

import static org.springframework.http.MediaType.APPLICATION_JSON_VALUE;
import static org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE;

@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping(path = "/api/v1/admin/attractions", produces = APPLICATION_JSON_VALUE)
public class AttractionAdminController {

	private final AttractionImageAdminService attractionImageAdminService;

	@PreAuthorize("hasRole('ADMIN')")
	@PostMapping(path = "/{keyId}/image", consumes = MULTIPART_FORM_DATA_VALUE)
	public AttractionImageAdminService.AttractionImageUploadResponse uploadCoverImage(
			@PathVariable String keyId,
			@RequestPart("file") MultipartFile file
	) {
		return attractionImageAdminService.uploadCoverImage(keyId, file);
	}

}

