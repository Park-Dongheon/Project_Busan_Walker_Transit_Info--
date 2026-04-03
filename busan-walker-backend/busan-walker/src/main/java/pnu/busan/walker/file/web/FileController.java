package pnu.busan.walker.file.web;

import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import pnu.busan.walker.file.service.ImageFileStorageService;
import pnu.busan.walker.file.service.StoredImageFile;

import static org.springframework.http.MediaType.APPLICATION_JSON_VALUE;
import static org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE;

@RestController
@Validated
@RequiredArgsConstructor
@RequestMapping(path = "/api/v1/files", produces = APPLICATION_JSON_VALUE)
public class FileController {

	private final ImageFileStorageService imageFileStorageService;

	@PostMapping(path = "/upload", consumes = MULTIPART_FORM_DATA_VALUE)
	public UploadFileResponse upload(
			@RequestPart("file") MultipartFile file,
			@RequestParam(name = "scope", required = false) String scope
	) {
		StoredImageFile stored = imageFileStorageService.storeImage(file, scope);
		return new UploadFileResponse(stored.publicUrl());
	}

	public record UploadFileResponse(
			String url
	) {}

}

