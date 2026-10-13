<?php
/**
 * What a source of tracks looks like.
 *
 * @package Riff
 * @since 0.2.0
 */

namespace Riff;

use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * A source answers three questions: which posts it can read, what tracks a post holds, and how
 * those tracks render as blocks the player takes over. The library asks every source; the first
 * that claims a post reads it.
 *
 * @since 0.2.0
 */
interface Source {

	/**
	 * A short id, such as "blocks".
	 *
	 * @since 0.2.0
	 *
	 * @return string
	 */
	public function id(): string;

	/**
	 * Whether this source can read the post.
	 *
	 * @since 0.2.0
	 *
	 * @param WP_Post $post Post.
	 * @return bool
	 */
	public function supports( WP_Post $post ): bool;

	/**
	 * The tracks in the post, in order, in the shape Tracks::schema() describes.
	 *
	 * @since 0.2.0
	 *
	 * @param WP_Post $post Post.
	 * @return array[]
	 */
	public function tracks( WP_Post $post ): array;

	/**
	 * The tracks rendered as figures carrying data-riff-track, which riff.js turns into rows.
	 *
	 * @since 0.2.0
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	public function html( WP_Post $post ): string;

	/**
	 * A WHERE clause fragment (without a leading AND) matching posts this source can read, or an
	 * empty string when the source cannot say from SQL alone.
	 *
	 * @since 0.2.0
	 *
	 * @return string
	 */
	public function where(): string;
}
