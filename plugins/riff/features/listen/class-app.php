<?php
/**
 * The app: a block, with a shortcode alias, that turns the page it sits on into the place to listen.
 *
 * @since 4.0.0
 * @package Riff
 */

namespace Riff\Listen;

use WP_Post;

use Riff\Library;
use Riff\Player;
use Riff\Tracks;

defined( 'ABSPATH' ) || exit;

/**
 * The listening page.
 *
 * The page holding the block is the route, the way a shop plugin's shop page is. Inside it the
 * library and every post open without leaving the page, so the music never stops. The server
 * renders the first view, so the page reads without the script and search engines see the posts.
 * A post is addressed by ?riff={id} or ?riff={slug} on the same page.
 */
final class App {

	/**
	 * The page template that is the block and nothing else, for a page that should be all player.
	 * Registered on block themes (WordPress 6.7 and newer); a page picks it under Template, which
	 * stores the slug, "listen", in its page template meta.
	 *
	 * @since 4.0.0
	 */
	public const TEMPLATE = 'riff//listen';

	/**
	 * The query argument that opens a post inside the app.
	 *
	 * @since 4.0.0
	 */
	public const QUERY = 'riff';

	/**
	 * Hooks the block and the shortcode.
	 *
	 * @since 4.0.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'init' ) );
	}

	/**
	 * Registers the block from its folder and the shortcode.
	 *
	 * @since 4.0.0
	 */
	public static function init(): void {
		register_block_type( RIFF_DIR . 'features/listen/block' );
		wp_set_script_translations( 'riff-app-editor-script', 'riff' );
		add_shortcode( 'riff', array( self::class, 'shortcode' ) );
		add_filter( 'riff_library_item', array( self::class, 'item_meta' ), 10, 2 );
		if ( function_exists( 'register_block_template' ) ) {
			register_block_template(
				self::TEMPLATE,
				array(
					'title'       => __( 'Listen', 'riff' ),
					'description' => __( 'The Riff block and nothing else: no header, no footer, the whole page is the player.', 'riff' ),
					'post_types'  => array( 'page' ),
					'content'     => '<!-- wp:riff/app {"align":"full"} /-->',
				)
			);
		}
	}

	/**
	 * [riff], the same as the block.
	 *
	 * @since 4.0.0
	 * @return string
	 */
	public static function shortcode(): string {
		return self::render();
	}

	/**
	 * The app's markup, with the first view rendered on the server.
	 *
	 * @since 4.0.0
	 * @param array $attributes Block attributes.
	 * @return string
	 */
	public static function render( array $attributes = array() ): string {
		if ( ! Player::enabled() ) {
			return '';
		}
		$page  = (string) get_permalink();
		$post  = self::requested();
		$view  = $post ? self::post_view( $post, $page ) : self::library_view( $page );
		$align = isset( $attributes['align'] ) && in_array( $attributes['align'], array( 'wide', 'full' ), true ) ? ' align' . $attributes['align'] : '';
		// Inside a block render the wrapper carries the block's supports (colours, type); the
		// shortcode has no block, so it gets the plain class.
		$wrapper = \WP_Block_Supports::$block_to_render
			? get_block_wrapper_attributes( array( 'class' => 'riff-app' ) )
			: 'class="riff-app' . esc_attr( $align ) . '"';
		return sprintf(
			'<div %s data-riff-app data-riff-rest="%s" data-riff-page="%s" data-riff-query="%s">' .
			'<nav class="riff-app-bar" aria-label="%s"><a class="riff-app-home" href="%s">%s</a></nav>' .
			'<div class="riff-app-view" data-riff-app-view>%s</div></div>',
			$wrapper,
			esc_url( rest_url( Library::REST . '/library' ) ),
			esc_url( $page ),
			esc_attr( self::QUERY ),
			esc_attr__( 'Riff', 'riff' ),
			esc_url( $page ),
			esc_html__( 'Library', 'riff' ),
			$view
		);
	}

	/**
	 * The post the address opens, when there is one that can be played.
	 *
	 * @since 4.0.0
	 * @return WP_Post|null
	 */
	private static function requested(): ?WP_Post {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- which post to show; nothing changes.
		$raw = isset( $_GET[ self::QUERY ] ) ? sanitize_text_field( wp_unslash( $_GET[ self::QUERY ] ) ) : '';
		if ( '' === $raw ) {
			return null;
		}
		// An ID, or a post's slug: ?riff=compositions reads as well as ?riff=12, for links written by hand.
		$post = ctype_digit( $raw ) ? get_post( (int) $raw ) : get_page_by_path( $raw, OBJECT, 'post' );
		if ( ! $post instanceof WP_Post || ! is_post_publicly_viewable( $post ) || post_password_required( $post ) ) {
			return null;
		}
		return $post;
	}

	/**
	 * The address of a post inside the app.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $page    The app page's address.
	 * @return string
	 */
	public static function link( int $post_id, string $page ): string {
		return add_query_arg( self::QUERY, $post_id, $page );
	}

	/**
	 * The library: a grid of the posts with tracks.
	 *
	 * @since 4.0.0
	 * @param string $page The app page's address.
	 * @return string
	 */
	private static function library_view( string $page ): string {
		$query = Library::query();
		if ( ! $query->posts ) {
			return '<p class="riff-app-empty">' . esc_html__( 'Nothing to play yet. Add an audio or video block to a post.', 'riff' ) . '</p>';
		}
		$cards = '';
		foreach ( $query->posts as $post ) {
			$cards .= self::card( Library::item( $post ), $page );
		}
		return '<h2 class="riff-app-title">' . esc_html__( 'Library', 'riff' ) . '</h2><div class="riff-grid">' . $cards . '</div>';
	}

	/**
	 * One post in the grid.
	 *
	 * @param array  $item Library item.
	 * @param string $page The app page's address.
	 * @return string
	 */
	private static function card( array $item, string $page ): string {
		$art = $item['art'] ? end( $item['art'] )['src'] : '';
		// The same markup app.js writes in card(): a link and a play button side by side, never one
		// inside the other.
		return sprintf(
			'<div class="riff-card" data-riff-post="%1$d"><span class="riff-card-art">%2$s<button type="button" class="riff-card-play" data-riff-app-action="play-card" data-riff-post="%1$d" aria-label="%3$s"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button></span><a class="riff-card-link" href="%4$s"><span class="riff-card-title">%5$s</span></a><span class="riff-card-sub">%6$s</span></div>',
			(int) $item['id'],
			$art ? '<img src="' . esc_url( $art ) . '" alt="" loading="lazy" decoding="async">' : '',
			/* translators: %s: track or post title. */
			esc_attr( sprintf( __( 'Play %s', 'riff' ), $item['title'] ) ),
			esc_url( self::link( (int) $item['id'], $page ) ),
			esc_html( $item['title'] ),
			esc_html( $item['meta'] ?? self::meta( $item ) )
		);
	}

	/**
	 * Writes the byline into a library item, so the app and the REST route carry it with the
	 * language's own plural forms instead of composing it in JavaScript.
	 *
	 * @since 4.0.0
	 *
	 * @param array    $item Library item.
	 * @param \WP_Post $post Its post.
	 * @return array
	 */
	public static function item_meta( $item, $post ) {
		unset( $post );
		if ( is_array( $item ) ) {
			$item['meta'] = self::meta( $item );
		}
		return $item;
	}

	/**
	 * A post opened: its title and byline beside Play and Shuffle, then its tracks, the blocks
	 * rendered as the post renders them.
	 *
	 * @param WP_Post $post Post.
	 * @param string  $page The app page's address.
	 * @return string
	 */
	private static function post_view( WP_Post $post, string $page ): string {
		$detail = Library::post( $post );
		if ( ! $detail['tracks'] ) {
			return self::library_view( $page );
		}
		return sprintf(
			'<header class="riff-album"><div class="riff-album-text"><h2 class="riff-album-title">%s</h2><p class="riff-album-meta">%s</p></div>' .
			'<p class="riff-album-actions"><button type="button" class="riff-pill riff-pill-solid" data-riff-app-action="play">%s</button><button type="button" class="riff-pill" data-riff-app-action="shuffle">%s</button></p></header>' .
			'<div class="riff-album-tracks" data-riff-tracks="%s">%s</div>',
			esc_html( $detail['title'] ),
			esc_html( self::meta( $detail ) ),
			esc_html__( 'Play', 'riff' ),
			esc_html__( 'Shuffle', 'riff' ),
			esc_attr( wp_json_encode( $detail['tracks'] ) ),
			$detail['html']
		);
	}

	/**
	 * "Artist · 10 tracks · 7 min", with the parts that are known.
	 *
	 * @param array $item Library item.
	 * @return string
	 */
	public static function meta( array $item ): string {
		$parts = array();
		if ( ! empty( $item['artist'] ) ) {
			$parts[] = $item['artist'];
		}
		/* translators: %s: number of tracks. */
		$parts[] = sprintf( _n( '%s track', '%s tracks', (int) $item['count'], 'riff' ), number_format_i18n( (int) $item['count'] ) );
		$minutes = (int) round( (float) $item['duration'] / 60 );
		if ( $minutes ) {
			/* translators: %s: number of minutes. */
			$parts[] = sprintf( _n( '%s min', '%s min', $minutes, 'riff' ), number_format_i18n( $minutes ) );
		}
		return implode( ' · ', $parts );
	}
}
