<?php
/**
 * First run: one admin notice that offers to create the Listen page and points to the first album.
 *
 * @since 4.21.0
 * @package Riff
 */

namespace Riff\Listen;

use WP_Query;

defined( 'ABSPATH' ) || exit;

/**
 * The first-run notice.
 *
 * Riff has no settings screen, so the notice is the only setup there is. It shows on the
 * Dashboard and the Plugins screen while the site has no Listen page or no music, to people who
 * can publish pages, and goes away for good once both exist or once they dismiss it. The button
 * creates a published page holding the Riff block; nothing else is created or stored.
 */
final class First_Run {

	/**
	 * The admin-post action that creates the Listen page.
	 *
	 * @since 4.21.0
	 */
	public const CREATE = 'riff_create_listen_page';

	/**
	 * The admin-post action that dismisses the notice.
	 *
	 * @since 4.21.0
	 */
	public const DISMISS = 'riff_dismiss_first_run';

	/**
	 * User option (user meta, per site) set when someone dismisses the notice.
	 *
	 * @since 4.21.0
	 */
	public const DISMISSED = 'riff_first_run_dismissed';

	/**
	 * Who sees the notice and may press its button. Creating the page publishes it, so this is the
	 * capability WordPress itself checks for that, not manage_options: an editor can do it too.
	 *
	 * @since 4.21.0
	 */
	public const CAPABILITY = 'publish_pages';

	/**
	 * The guide to adding music, on the plugin's site.
	 *
	 * @since 4.21.0
	 */
	public const GUIDE = 'https://riffpress.com/add-music/';

	/**
	 * The admin screens the notice shows on: where someone lands after activating a plugin.
	 *
	 * @since 4.21.0
	 */
	public const SCREENS = array( 'dashboard', 'plugins' );

	/**
	 * Hooks the notice and its two actions.
	 *
	 * @since 4.21.0
	 */
	public static function register(): void {
		add_action( 'admin_notices', array( self::class, 'notice' ) );
		add_action( 'admin_enqueue_scripts', array( self::class, 'script' ) );
		add_action( 'admin_post_' . self::CREATE, array( self::class, 'create' ) );
		add_action( 'admin_post_' . self::DISMISS, array( self::class, 'dismiss' ) );
	}

	/**
	 * The site's Listen page: the oldest published page holding the Riff block or using the Listen
	 * template.
	 *
	 * @since 4.21.0
	 *
	 * @return int Page ID, or 0 when there is none.
	 */
	public static function listen_page(): int {
		$base  = array(
			'post_type'              => 'page',
			'post_status'            => 'publish',
			'orderby'                => 'ID',
			'order'                  => 'ASC',
			'posts_per_page'         => 5,
			'no_found_rows'          => true,
			'update_post_term_cache' => false,
		);
		$found = array_merge(
			( new WP_Query(
				$base + array(
					's'              => 'wp:riff/app',
					'sentence'       => true,
					'search_columns' => array( 'post_content' ),
				)
			) )->posts,
			( new WP_Query(
				$base + array(
					'meta_key'   => '_wp_page_template', // phpcs:ignore WordPress.DB.SlowDBQuery -- one indexed key, on two admin screens.
					'meta_value' => 'listen', // phpcs:ignore WordPress.DB.SlowDBQuery -- as above.
				)
			) )->posts
		);
		$ids   = array();
		foreach ( $found as $page ) {
			// The search matches the text anywhere; holds_player() reads the blocks.
			if ( Standalone::holds_player( $page ) ) {
				$ids[] = $page->ID;
			}
		}
		return $ids ? min( $ids ) : 0;
	}

	/**
	 * Whether the Media Library holds any audio: the first album, or anything after it.
	 *
	 * @since 4.21.0
	 *
	 * @return bool
	 */
	public static function has_music(): bool {
		$query = new WP_Query(
			array(
				'post_type'              => 'attachment',
				'post_status'            => array( 'inherit', 'private' ),
				'post_mime_type'         => 'audio',
				'posts_per_page'         => 1,
				'fields'                 => 'ids',
				'no_found_rows'          => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
			)
		);
		return (bool) $query->posts;
	}

	/**
	 * Whether a user has dismissed the notice on this site.
	 *
	 * @since 4.21.0
	 *
	 * @param int $user_id User ID; the current user by default.
	 * @return bool
	 */
	public static function dismissed( int $user_id = 0 ): bool {
		return (bool) get_user_option( self::DISMISSED, $user_id ? $user_id : get_current_user_id() );
	}

	/**
	 * Whether the current user should see the notice: they can publish pages, have not dismissed
	 * it, and the site still lacks a Listen page or music.
	 *
	 * @since 4.21.0
	 *
	 * @return bool
	 */
	public static function should_show(): bool {
		if ( ! current_user_can( self::CAPABILITY ) || self::dismissed() ) {
			return false;
		}
		return ! self::listen_page() || ! self::has_music();
	}

	/**
	 * Whether this admin screen is one the notice shows on.
	 *
	 * @return bool
	 */
	private static function on_screen(): bool {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		return $screen && in_array( $screen->id, self::SCREENS, true );
	}

	/**
	 * Prints the notice, in core's notice markup.
	 *
	 * @since 4.21.0
	 */
	public static function notice(): void {
		if ( ! self::on_screen() ) {
			return;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- which message to show after the redirect; nothing changes.
		$created = isset( $_GET[ self::CREATE ] ) ? self::listen_page() : 0;
		if ( ! self::should_show() ) {
			if ( $created ) {
				wp_admin_notice(
					sprintf(
						/* translators: %s: link to the Listen page. */
						__( 'Your Listen page is ready: %s.', 'riff' ),
						self::page_link( $created )
					),
					array(
						'type'        => 'success',
						'dismissible' => true,
					)
				);
			}
			return;
		}
		$page    = self::listen_page();
		$album   = sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'media-new.php' ) ),
			esc_html__( 'Add your first album', 'riff' )
		);
		$guide   = sprintf(
			'<a href="%s">%s</a>',
			esc_url( self::GUIDE ),
			esc_html__( 'How to add music', 'riff' )
		);
		$message = '<p><strong>' . esc_html__( 'Riff is ready to play your music.', 'riff' ) . '</strong> ';
		if ( ! $page ) {
			$message .= esc_html__( 'Create a Listen page where visitors can browse your albums and keep listening while they move around your site.', 'riff' ) . '</p>';
			$message .= sprintf(
				'<p><a class="button button-primary" href="%s">%s</a>',
				esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=' . self::CREATE ), self::CREATE ) ),
				esc_html__( 'Create Listen page', 'riff' )
			);
			if ( ! self::has_music() ) {
				$message .= ' ' . $album;
			}
			$message .= '</p>';
		} else {
			$message .= sprintf(
				/* translators: 1: link to the Listen page, 2: "Add your first album" link, 3: "How to add music" link. */
				__( 'Your Listen page is %1$s. Next, %2$s: upload the tracks to the Media Library and they appear there, sorted into albums and artists. %3$s', 'riff' ),
				self::page_link( $page ),
				$album,
				$guide
			) . '</p>';
		}
		wp_admin_notice(
			$message,
			array(
				'type'               => 'info',
				'dismissible'        => true,
				'additional_classes' => array( 'riff-first-run' ),
				'attributes'         => array( 'data-riff-dismiss' => wp_nonce_url( admin_url( 'admin-post.php?action=' . self::DISMISS ), self::DISMISS ) ),
				'paragraph_wrap'     => false,
			)
		);
	}

	/**
	 * A link to the Listen page, by its title.
	 *
	 * @param int $page Page ID.
	 * @return string
	 */
	private static function page_link( int $page ): string {
		$title = get_the_title( $page );
		return sprintf( '<a href="%s">%s</a>', esc_url( (string) get_permalink( $page ) ), esc_html( '' !== $title ? $title : __( 'Listen', 'riff' ) ) );
	}

	/**
	 * Remembers a dismissal when the notice's close button is pressed. Core's own script hides the
	 * notice; this tells the server, so it stays hidden.
	 *
	 * @since 4.21.0
	 */
	public static function script(): void {
		if ( ! self::on_screen() || ! self::should_show() ) {
			return;
		}
		wp_add_inline_script(
			'common',
			"document.addEventListener( 'click', function ( event ) { var notice = event.target.closest( '.riff-first-run' ); if ( notice && event.target.closest( '.notice-dismiss' ) ) { fetch( notice.dataset.riffDismiss, { credentials: 'same-origin' } ); } } );"
		);
	}

	/**
	 * Creates the Listen page, unless there is one, and goes back to the screen the button was on.
	 *
	 * @since 4.21.0
	 */
	public static function create(): void {
		check_admin_referer( self::CREATE );
		if ( ! current_user_can( self::CAPABILITY ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to create pages.', 'riff' ), 403 );
		}
		if ( ! self::listen_page() ) {
			$page = wp_insert_post(
				array(
					'post_type'    => 'page',
					'post_status'  => 'publish',
					'post_title'   => __( 'Listen', 'riff' ),
					'post_name'    => 'listen',
					'post_content' => '<!-- wp:riff/app {"align":"full"} /-->',
				),
				true
			);
			if ( is_wp_error( $page ) ) {
				wp_die( esc_html( $page->get_error_message() ) );
			}
		}
		wp_safe_redirect( add_query_arg( self::CREATE, '1', self::back() ) );
		exit;
	}

	/**
	 * Remembers that the current user dismissed the notice on this site.
	 *
	 * @since 4.21.0
	 */
	public static function dismiss(): void {
		check_admin_referer( self::DISMISS );
		update_user_option( get_current_user_id(), self::DISMISSED, time() );
		wp_safe_redirect( self::back() );
		exit;
	}

	/**
	 * The admin screen to return to: the one the button was on, or the Dashboard.
	 *
	 * @return string
	 */
	private static function back(): string {
		$back = wp_get_referer();
		return $back ? remove_query_arg( self::CREATE, $back ) : admin_url();
	}
}
