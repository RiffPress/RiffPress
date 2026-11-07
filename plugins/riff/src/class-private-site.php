<?php
/**
 * A site only its members can reach, until its owner opens it.
 *
 * @since 6.3.0
 * @package Riff
 */

namespace Riff;

use WP;
use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Private mode, a setting under Settings › Reading beside the one that asks search engines to stay
 * away, which it also turns on. WordPress has no private site: a page can be private, but its files
 * stay public. Here every address on the front end and in the REST API asks that the visitor can read
 * this site, which on a network means belonging to it, and the audio and video go into Protect's
 * folder, as new files arrive and, in the background, as the setting changes. Files someone protected
 * themselves stay protected when the site opens. Images, such as covers, keep their public addresses.
 */
final class Private_Site {

	/**
	 * The option.
	 *
	 * @since 6.3.0
	 */
	public const OPTION = 'riff_private';

	/**
	 * Attachment meta marking a file this mode protected, so opening the site puts back only those.
	 *
	 * @since 6.3.0
	 */
	public const META = '_riff_private';

	/**
	 * The background job that moves a site's files when the setting changes.
	 *
	 * @since 6.3.0
	 */
	public const JOB = 'riff_private_sweep';

	/**
	 * How many files the job moves at a time.
	 *
	 * @since 6.3.0
	 */
	private const BATCH = 25;

	/**
	 * Hooks in.
	 *
	 * @since 6.3.0
	 */
	public static function register(): void {
		add_action( 'admin_init', array( self::class, 'settings' ) );
		add_action( 'init', array( self::class, 'register_setting' ) );
		add_action( 'init', array( self::class, 'keep_watch' ) );
		add_action( 'parse_request', array( self::class, 'gate' ), 0 );
		add_filter( 'rest_authentication_errors', array( self::class, 'rest' ), 200 );
		add_filter( 'pre_option_blog_public', array( self::class, 'blog_public' ) );
		add_filter( 'xmlrpc_enabled', array( self::class, 'open' ) );
		add_filter( 'comments_open', array( self::class, 'open' ) );
		add_filter( 'site_status_tests', array( self::class, 'tests' ) );
		// Last, once WordPress has read the file: it is handed its path before this.
		add_filter( 'wp_generate_attachment_metadata', array( self::class, 'uploaded' ), 99, 2 );
		add_action( 'add_option_' . self::OPTION, array( self::class, 'changed' ) );
		add_action( 'update_option_' . self::OPTION, array( self::class, 'changed' ) );
		add_action( self::JOB, array( self::class, 'sweep' ) );
	}

	/**
	 * Whether this site is private.
	 *
	 * @since 6.3.0
	 *
	 * @return bool
	 */
	public static function on(): bool {
		return rest_sanitize_boolean( get_option( self::OPTION, false ) );
	}

	/**
	 * Whether the current visitor may reach the site: not at all when it is private, unless they
	 * can read it, which on a network takes belonging to it.
	 *
	 * @since 6.3.0
	 *
	 * @return bool
	 */
	public static function allowed(): bool {
		return ! self::on() || current_user_can( 'read' );
	}

	/**
	 * Registers the setting.
	 *
	 * @since 6.3.0
	 */
	public static function register_setting(): void {
		register_setting(
			'reading',
			self::OPTION,
			array(
				'type'              => 'boolean',
				'description'       => __( 'Whether only people with an account on this site can reach it.', 'riff' ),
				'default'           => false,
				'sanitize_callback' => 'rest_sanitize_boolean',
				'show_in_rest'      => true,
			)
		);
	}

	/**
	 * The box under Settings › Reading.
	 *
	 * @since 6.3.0
	 */
	public static function settings(): void {
		add_settings_field(
			self::OPTION,
			__( 'Private site', 'riff' ),
			static function (): void {
				printf(
					'<label for="%1$s"><input name="%1$s" type="checkbox" id="%1$s" value="1"%2$s> %3$s</label><p class="description">%4$s</p>',
					esc_attr( self::OPTION ),
					checked( rest_sanitize_boolean( get_option( self::OPTION, false ) ), true, false ),
					esc_html__( 'Only people with an account on this site can reach it', 'riff' ),
					esc_html__( 'Its audio and video files are protected too. Images, such as covers, keep their public addresses. Where anyone can register, anyone can make an account.', 'riff' )
				);
			},
			'reading'
		);
	}

	/**
	 * Refuses the front end, before anything answers it. The REST API has its own answer, and a
	 * protected file's address has already been decided, by Protect, by now.
	 *
	 * @since 6.3.0
	 *
	 * @param WP $wp The request.
	 */
	public static function gate( $wp ): void {
		if ( self::allowed() || ! empty( $wp->query_vars['rest_route'] ) ) {
			return;
		}
		/**
		 * Fires before a private site refuses a visitor, for a page of the site's own in place of
		 * WordPress's message.
		 *
		 * @since 6.3.0
		 */
		do_action( 'riff_private_refused' );
		nocache_headers();
		wp_die(
			esc_html__( 'This site is private.', 'riff' ) . ' <a href="' . esc_url( wp_login_url() ) . '">' . esc_html__( 'Log in', 'riff' ) . '</a>',
			esc_html__( 'Private', 'riff' ),
			array( 'response' => 403 )
		);
	}

	/**
	 * Refuses the REST API. Later than core's own cookie check, so it knows who is asking.
	 *
	 * @since 6.3.0
	 *
	 * @param mixed $result An error or success already decided, or null.
	 * @return mixed
	 */
	public static function rest( $result ) {
		if ( is_wp_error( $result ) || self::allowed() ) {
			return $result;
		}
		return new WP_Error( 'riff_private', __( 'This site is private.', 'riff' ), array( 'status' => rest_authorization_required_code() ) );
	}

	/**
	 * Asks search engines to stay away, and takes the sitemap with it, as Settings › Reading's own
	 * box does.
	 *
	 * @since 6.3.0
	 *
	 * @param mixed $value The option, or false to read it.
	 * @return mixed
	 */
	public static function blog_public( $value ) {
		return self::on() ? '0' : $value;
	}

	/**
	 * Whether what depends on the site being open stays on.
	 *
	 * @since 6.3.0
	 *
	 * @param mixed $enabled Whether it was on.
	 * @return bool
	 */
	public static function open( $enabled ): bool {
		return (bool) $enabled && ! self::on();
	}

	/**
	 * Protects a file as it arrives on a private site.
	 *
	 * @since 6.3.0
	 *
	 * @param mixed $metadata The file's metadata.
	 * @param int   $id       Attachment ID.
	 * @return mixed
	 */
	public static function uploaded( $metadata, $id ) {
		if ( self::on() ) {
			self::keep( (int) $id );
		}
		return $metadata;
	}

	/**
	 * Protects a file, and marks it as this mode's, unless it was protected already. Marked whatever
	 * comes of it, so a file that can't be moved doesn't hold up the rest; the job tries those again.
	 *
	 * @param int $id Attachment ID.
	 * @return bool Whether it is protected now.
	 */
	private static function keep( int $id ): bool {
		$type = strtok( (string) get_post_mime_type( $id ), '/' );
		if ( ( 'audio' !== $type && 'video' !== $type ) || Protect::is( $id ) ) {
			return true;
		}
		$done = ! is_wp_error( Protected_Files::protect( $id ) );
		update_post_meta( $id, self::META, $done ? 'protected' : 'failed' );
		return $done;
	}

	/**
	 * While the site is private the job comes back every hour, for a file that arrived some way the
	 * upload's filter never saw, one that couldn't be moved before, or a batch cut short.
	 *
	 * @since 6.3.0
	 */
	public static function keep_watch(): void {
		if ( self::on() && ! wp_next_scheduled( self::JOB ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'hourly', self::JOB );
		}
	}

	/**
	 * Whether a file is the video or streaming version of a song someone protected themselves, so
	 * it stays protected when the site opens, as the song does.
	 *
	 * @param int $id Attachment ID.
	 * @return bool
	 */
	private static function kept_for_a_song( int $id ): bool {
		$songs = get_posts(
			array(
				'post_type'        => 'attachment',
				'post_status'      => 'inherit',
				'fields'           => 'ids',
				'numberposts'      => -1,
				'suppress_filters' => false,
				// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- a background job, a file at a time.
				'meta_query'       => array(
					'relation' => 'OR',
					array(
						'key'   => Media::VIDEO_META,
						'value' => $id,
					),
					array(
						'key'   => Media::STREAM_META,
						'value' => $id,
					),
				),
			)
		);
		foreach ( $songs as $song ) {
			if ( Protect::is( (int) $song ) && ! get_post_meta( (int) $song, self::META, true ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Adds the Site Health check.
	 *
	 * @since 6.3.0
	 *
	 * @param mixed $tests Tests.
	 * @return mixed
	 */
	public static function tests( $tests ) {
		$tests['direct']['riff_private_site'] = array(
			'label' => __( 'Riff\'s private site', 'riff' ),
			'test'  => array( self::class, 'health' ),
		);
		return $tests;
	}

	/**
	 * Whether anything is still public on a private site.
	 *
	 * @since 6.3.0
	 *
	 * @return array
	 */
	public static function health(): array {
		$left   = self::on() ? count( self::unprotected( 1 ) ) : 0;
		$result = array(
			'label'       => __( 'Riff\'s private site keeps its audio and video protected', 'riff' ),
			'status'      => 'good',
			'badge'       => array(
				'label' => __( 'Security', 'riff' ),
				'color' => 'blue',
			),
			'description' => '<p>' . esc_html__( 'Every audio and video file is behind the site\'s gate, or the site is open.', 'riff' ) . '</p>',
			'test'        => 'riff_private_site',
		);
		if ( $left ) {
			$result['status']      = 'critical';
			$result['label']       = __( 'Some of this private site\'s audio or video is still public', 'riff' );
			$result['description'] = '<p>' . esc_html__( 'Riff tries again every hour. A file kept off this server, which Riff cannot move, stays public until the plugin that keeps it can protect it.', 'riff' ) . '</p>';
		}
		return $result;
	}

	/**
	 * Audio and video not yet protected.
	 *
	 * @param int  $count How many.
	 * @param bool $fresh Only those this mode hasn't tried.
	 * @return int[] Attachment IDs.
	 */
	private static function unprotected( int $count, bool $fresh = false ): array {
		$query = array(
			array(
				'key'     => Protected_Files::META,
				'compare' => 'NOT EXISTS',
			),
		);
		if ( $fresh ) {
			$query[] = array(
				'key'     => self::META,
				'compare' => 'NOT EXISTS',
			);
		}
		return get_posts(
			array(
				'post_type'        => 'attachment',
				'post_status'      => 'inherit',
				'post_mime_type'   => array( 'audio', 'video' ),
				'fields'           => 'ids',
				'numberposts'      => $count,
				'suppress_filters' => false,
				'meta_query'       => $query, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- a background job, or Site Health.
			)
		);
	}

	/**
	 * The setting changed: the job moves the site's files, in the background, as an album can take
	 * longer to move than a request is given.
	 *
	 * @since 6.3.0
	 */
	public static function changed(): void {
		wp_clear_scheduled_hook( self::JOB );
		wp_schedule_single_event( time(), self::JOB );
		// Any cover kept as a public file goes, and addresses change with the drawing.
		Listen\Art::redraw( true );
	}

	/**
	 * Moves a batch of the site's files to match the setting, and comes back while it is getting
	 * somewhere. Once none are left to try, what could not be moved is tried again next time.
	 *
	 * @since 6.3.0
	 */
	public static function sweep(): void {
		$moved = 0;
		if ( self::on() ) {
			$files = self::unprotected( self::BATCH, true );
			foreach ( $files as $id ) {
				$moved += self::keep( (int) $id ) ? 1 : 0;
			}
			if ( ! $files ) {
				delete_metadata( 'post', 0, self::META, 'failed', true );
			}
		} else {
			$files = get_posts(
				array(
					'post_type'        => 'attachment',
					'post_status'      => 'inherit',
					'fields'           => 'ids',
					'numberposts'      => self::BATCH,
					'suppress_filters' => false,
					'meta_key'         => self::META, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- a background job, a batch at a time.
				)
			);
			foreach ( $files as $id ) {
				if ( 'protected' === get_post_meta( (int) $id, self::META, true ) && ! self::kept_for_a_song( (int) $id ) ) {
					Protected_Files::unprotect( (int) $id );
				}
				delete_post_meta( (int) $id, self::META );
				++$moved;
			}
		}
		if ( $moved && count( $files ) === self::BATCH ) {
			wp_schedule_single_event( time(), self::JOB );
		}
	}
}
