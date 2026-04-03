package pnu.busan.walker.review.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pnu.busan.walker.attraction.domain.Attraction;
import pnu.busan.walker.attraction.repository.AttractionRepository;
import pnu.busan.walker.common.domain.Role;
import pnu.busan.walker.common.error.exception.ForbiddenException;
import pnu.busan.walker.file.service.ImageFileStorageService;
import pnu.busan.walker.review.domain.AttractionReview;
import pnu.busan.walker.review.domain.ReviewComment;
import pnu.busan.walker.review.dto.ReviewUpdateRequest;
import pnu.busan.walker.review.repository.AttractionReviewRepository;
import pnu.busan.walker.review.repository.ReviewCommentRepository;
import pnu.busan.walker.review.repository.ReviewImageRepository;
import pnu.busan.walker.review.repository.ReviewLikeRepository;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.repository.UserRepository;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReviewServicePermissionTest {

    @Mock private AttractionRepository attractionRepo;
    @Mock private UserRepository userRepo;
    @Mock private AttractionReviewRepository reviewRepo;
    @Mock private ReviewImageRepository reviewImageRepo;
    @Mock private ReviewCommentRepository reviewCommentRepo;
    @Mock private ReviewLikeRepository reviewLikeRepo;
    @Mock private ImageFileStorageService imageFileStorageService;

    private ReviewService reviewService;

    @BeforeEach
    void setUp() {
        reviewService = new ReviewService(
                attractionRepo,
                userRepo,
                reviewRepo,
                reviewImageRepo,
                reviewCommentRepo,
                reviewLikeRepo,
                imageFileStorageService
        );
    }

    @Test
    void updateReview_adminCanUpdateOthersReview() {
        AttractionReview review = reviewOwnedBy(2L, "A-1", 10L);
        when(reviewRepo.findVisibleByIdAndKeyId("A-1", 10L)).thenReturn(Optional.of(review));
        when(userRepo.findById(1L)).thenReturn(Optional.of(user(1L, Role.ADMIN)));

        reviewService.updateReview(1L, "A-1", 10L, new ReviewUpdateRequest(5, "updated", List.of()));

        assertEquals((byte) 5, review.getRating());
        assertEquals("updated", review.getBody());
        verify(reviewRepo).save(review);
        verify(reviewImageRepo).deleteAllByReviewId(10L);
        verify(reviewImageRepo).flush();
    }

    @Test
    void updateReview_memberCannotUpdateOthersReview() {
        AttractionReview review = reviewOwnedBy(2L, "A-1", 10L);
        when(reviewRepo.findVisibleByIdAndKeyId("A-1", 10L)).thenReturn(Optional.of(review));
        when(userRepo.findById(1L)).thenReturn(Optional.of(user(1L, Role.MEMBER)));

        assertThrows(
                ForbiddenException.class,
                () -> reviewService.updateReview(1L, "A-1", 10L, new ReviewUpdateRequest(5, "updated", List.of()))
        );

        verify(reviewRepo, never()).save(any());
    }

    @Test
    void deleteComment_adminCanDeleteOthersComment() {
        AttractionReview review = reviewOwnedBy(2L, "A-1", 10L);
        ReviewComment comment = commentOwnedBy(2L, 20L, review);

        when(reviewRepo.findVisibleByIdAndKeyId("A-1", 10L)).thenReturn(Optional.of(review));
        when(reviewCommentRepo.findById(20L)).thenReturn(Optional.of(comment));
        when(userRepo.findById(1L)).thenReturn(Optional.of(user(1L, Role.ADMIN)));

        reviewService.deleteComment(1L, "A-1", 10L, 20L);

        assertTrue(comment.isHidden());
        verify(reviewCommentRepo).save(comment);
    }

    @Test
    void deleteComment_memberCannotDeleteOthersComment() {
        AttractionReview review = reviewOwnedBy(2L, "A-1", 10L);
        ReviewComment comment = commentOwnedBy(2L, 20L, review);

        when(reviewRepo.findVisibleByIdAndKeyId("A-1", 10L)).thenReturn(Optional.of(review));
        when(reviewCommentRepo.findById(20L)).thenReturn(Optional.of(comment));
        when(userRepo.findById(1L)).thenReturn(Optional.of(user(1L, Role.MEMBER)));

        assertThrows(
                ForbiddenException.class,
                () -> reviewService.deleteComment(1L, "A-1", 10L, 20L)
        );

        assertFalse(comment.isHidden());
        verify(reviewCommentRepo, never()).save(any());
    }

    private User user(Long id, Role role) {
        User user = new User();
        user.setId(id);
        user.setRole(role);
        user.setDisplayName("tester-" + id);
        return user;
    }

    private AttractionReview reviewOwnedBy(Long authorId, String keyId, Long reviewId) {
        Attraction attraction = new Attraction();
        attraction.setKeyId(keyId);

        AttractionReview review = new AttractionReview();
        review.setId(reviewId);
        review.setAttraction(attraction);
        review.setAuthor(user(authorId, Role.MEMBER));
        review.setIsHidden((byte) 0);
        review.setRating((byte) 4);
        review.setBody("body");
        return review;
    }

    private ReviewComment commentOwnedBy(Long authorId, Long commentId, AttractionReview review) {
        ReviewComment comment = new ReviewComment();
        comment.setId(commentId);
        comment.setReview(review);
        comment.setAuthor(user(authorId, Role.MEMBER));
        comment.setBody("comment");
        comment.setHidden(false);
        return comment;
    }
}
