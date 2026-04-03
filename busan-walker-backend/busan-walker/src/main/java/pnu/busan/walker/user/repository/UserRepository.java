package pnu.busan.walker.user.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pnu.busan.walker.user.domain.User;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
	Optional<User> findByEmail(String email);
	boolean existsByEmail(String email);
}
