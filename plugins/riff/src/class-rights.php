<?php
/**
 * Rights and controls: who holds the music, under what licence, and how it may be heard.
 *
 * @since 6.17.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * Rights and controls.
 *
 * An artist owns their recordings and chooses how they are shared. WordPress keeps a copyright and
 * a credit for images, read from their EXIF data, and nothing for audio, so these are post meta
 * registered the native way (docs/native.md), on an album's post and on each track: the rights
 * holder, the year, the licence, the track's ISRC and the album's UPC, the uploader's statement that
 * the rights are theirs, whether listeners may download, and until when the music is available. A
 * track has what its album says unless it says otherwise. When it is released is WordPress's own
 * scheduled publishing.
 *
 * Every track Riff hands out, on a page, over REST, in a feed or an export, and every protected file
 * it serves, asks riff_may_play first, so a host can keep music to a pass, a membership or a window.
 */
final class Rights {

	/**
	 * Meta: the name of whoever holds the rights.
	 *
	 * @since 6.17.0
	 */
	public const HOLDER = 'riff_rights_holder';

	/**
	 * Meta: the year of the recording's first release, for ℗.
	 *
	 * @since 6.17.0
	 */
	public const YEAR = 'riff_rights_year';

	/**
	 * Meta: the licence's slug, one of LICENSES.
	 *
	 * @since 6.17.0
	 */
	public const LICENSE = 'riff_license';

	/**
	 * Meta on a track: its ISRC, twelve characters without hyphens.
	 *
	 * @since 6.17.0
	 */
	public const ISRC = 'riff_isrc';

	/**
	 * Meta on an album's post: its UPC or EAN.
	 *
	 * @since 6.17.0
	 */
	public const UPC = 'riff_upc';

	/**
	 * Meta: the uploader's statement that they own or control the rights.
	 *
	 * @since 6.17.0
	 */
	public const ATTESTED = 'riff_attested';

	/**
	 * Meta: whether listeners may download the files.
	 *
	 * @since 6.17.0
	 */
	public const DOWNLOADS = 'riff_downloads';

	/**
	 * Meta: when the music stops being available, in UTC as `Y-m-d H:i:s`, or none.
	 *
	 * @since 6.17.0
	 */
	public const UNTIL = 'riff_available_until';

	/**
	 * The query argument, and the X-Riff-Pass header, a pass arrives in.
	 *
	 * @since 6.17.0
	 */
	public const PASS = 'riff-pass';

	/**
	 * The licence a recording has when nobody chose one.
	 *
	 * @since 6.17.0
	 */
	public const DEFAULT_LICENSE = 'all-rights-reserved';

	/**
	 * The meta that a track takes from its album when it has none of its own.
	 */
	private const INHERITED = array( self::HOLDER, self::YEAR, self::LICENSE, self::ATTESTED, self::DOWNLOADS, self::UNTIL );

	/**
	 * Where a request is answered, for riff_may_play's `via`, while Riff serves a file or writes an
	 * export; null works it out from the request.
	 *
	 * @var string|null
	 */
	private static ?string $via = null;

	/**
	 * Whether attest() is keeping a statement in another user's name, which the sanitizer allows
	 * only then.
	 *
	 * @var bool
	 */
	private static bool $attesting = false;

	/**
	 * Hooks the meta, the licence link and the feed's enclosures.
	 *
	 * @since 6.17.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'register_meta' ) );
		add_action( 'wp_head', array( self::class, 'head' ) );
		add_filter( 'rss_enclosure', array( self::class, 'enclosure' ) );
		add_filter( 'atom_enclosure', array( self::class, 'enclosure' ) );
		add_filter( 'render_block_core/file', array( self::class, 'file_block' ), 10, 2 );
		add_filter( 'attachment_fields_to_edit', array( self::class, 'fields' ), 30, 2 );
		add_filter( 'attachment_fields_to_save', array( self::class, 'save' ), 30, 2 );
		add_action( 'enqueue_block_editor_assets', array( self::class, 'editor' ) );
		// A REST request is one wherever it is dispatched from, the block editor's preloading too.
		add_filter( 'rest_request_before_callbacks', array( self::class, 'rest_began' ), 10, 1 );
		add_filter( 'rest_request_after_callbacks', array( self::class, 'rest_ended' ), 10, 1 );
	}

	/**
	 * How many REST requests are being answered, inside one another.
	 *
	 * @var int
	 */
	private static int $rest = 0;

	/**
	 * Notes that a REST route is answering, for riff_may_play's `via`.
	 *
	 * @since 6.17.0
	 *
	 * @param mixed $response The response so far, passed through.
	 * @return mixed
	 */
	public static function rest_began( $response ) {
		++self::$rest;
		return $response;
	}

	/**
	 * Notes that a REST route has answered.
	 *
	 * @since 6.17.0
	 *
	 * @param mixed $response The response, passed through.
	 * @return mixed
	 */
	public static function rest_ended( $response ) {
		self::$rest = max( 0, self::$rest - 1 );
		return $response;
	}

	/**
	 * The Rights panel in the block editor's sidebar, for a post, where an album's rights are set.
	 *
	 * @since 6.17.0
	 */
	public static function editor(): void {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || 'post' !== $screen->post_type ) {
			return;
		}
		wp_enqueue_script( 'riff-rights', RIFF_URL . 'assets/rights.js', array( 'wp-plugins', 'wp-editor', 'wp-components', 'wp-core-data', 'wp-data', 'wp-element', 'wp-i18n' ), Player::version( 'assets/rights.js' ), true );
		wp_set_script_translations( 'riff-rights', 'riff' );
		$licenses = array();
		foreach ( self::licenses() as $slug => $license ) {
			$licenses[] = array(
				'value' => $slug,
				'label' => $license['label'],
			);
		}
		wp_add_inline_script(
			'riff-rights',
			'window.riffRights = ' . wp_json_encode(
				array(
					'licenses'  => $licenses,
					'statement' => self::statement(),
					'hash'      => self::statement_hash(),
					'required'  => self::attestation_required(),
				)
			) . ';',
			'before'
		);
	}

	/**
	 * A track's own rights in the Media Library: its ISRC, and a holder and licence where they
	 * are not its album's.
	 *
	 * @since 6.17.0
	 *
	 * @param array   $fields The attachment's fields.
	 * @param WP_Post $post   The attachment.
	 * @return array
	 */
	public static function fields( $fields, $post ) {
		if ( ! is_array( $fields ) || ! $post instanceof WP_Post || ! str_starts_with( (string) $post->post_mime_type, 'audio/' ) ) {
			return $fields;
		}
		$name = static fn( string $key ): string => 'attachments[' . $post->ID . '][' . $key . ']';
		// Its own, not the default the meta reads as when it has none.
		$current = metadata_exists( 'post', $post->ID, self::LICENSE ) ? (string) get_post_meta( $post->ID, self::LICENSE, true ) : '';
		$options = '<option value="">' . esc_html__( 'As the album says', 'riff' ) . '</option>';
		foreach ( self::licenses() as $slug => $license ) {
			$options .= sprintf( '<option value="%1$s"%2$s>%3$s</option>', esc_attr( $slug ), selected( $current, $slug, false ), esc_html( $license['label'] ) );
		}
		$fields[ self::HOLDER ]  = array(
			'label' => __( 'Rights holder', 'riff' ),
			'input' => 'text',
			'value' => (string) get_post_meta( $post->ID, self::HOLDER, true ),
			'helps' => __( 'Who holds the rights to this recording, where it is not who holds its album\'s.', 'riff' ),
		);
		$fields[ self::LICENSE ] = array(
			'label' => __( 'Licence', 'riff' ),
			'input' => 'html',
			'html'  => sprintf( '<select name="%1$s" id="%2$s">%3$s</select>', esc_attr( $name( self::LICENSE ) ), esc_attr( 'attachments-' . $post->ID . '-' . self::LICENSE ), $options ),
			'helps' => __( 'What listeners may do with the recording. All rights reserved unless the artist chooses a Creative Commons licence.', 'riff' ),
		);
		$fields[ self::ISRC ]    = array(
			'label' => 'ISRC',
			'input' => 'text',
			'value' => (string) get_post_meta( $post->ID, self::ISRC, true ),
			'helps' => __( 'The recording\'s code, as CC-XXX-YY-NNNNN.', 'riff' ),
		);
		return $fields;
	}

	/**
	 * Saves a track's own rights from the Media Library. WordPress has checked the nonce and the
	 * right to edit the attachment before this runs; an empty field takes the album's again.
	 *
	 * @since 6.17.0
	 *
	 * @param array $post       The attachment, as saved.
	 * @param array $attachment The submitted fields.
	 * @return array
	 */
	public static function save( $post, $attachment ) {
		$id = is_array( $post ) ? (int) ( $post['ID'] ?? 0 ) : 0;
		if ( ! $id || ! is_array( $attachment ) || ! current_user_can( 'edit_post', $id ) ) {
			return $post;
		}
		foreach ( array( self::HOLDER, self::LICENSE, self::ISRC ) as $key ) {
			if ( ! isset( $attachment[ $key ] ) ) {
				continue;
			}
			$value = trim( (string) $attachment[ $key ] );
			if ( self::ISRC === $key && '' !== $value && '' === self::sanitize_isrc( $value ) ) {
				$post['errors'][ $key ]['errors'][] = __( 'That is not an ISRC, so it was not changed.', 'riff' );
				continue;
			}
			if ( '' === $value ) {
				delete_post_meta( $id, $key );
			} else {
				update_post_meta( $id, $key, $value );
			}
		}
		return $post;
	}

	/**
	 * The licences an artist chooses from: Creative Commons 4.0 and CC0 1.0, or none.
	 *
	 * @since 6.17.0
	 *
	 * @return array<string, array{label: string, url: string}>
	 */
	public static function licenses(): array {
		$cc = static fn( string $code ): array => array(
			'label' => 'CC ' . strtoupper( $code ) . ' 4.0',
			'url'   => 'https://creativecommons.org/licenses/' . $code . '/4.0/',
		);
		return array(
			'all-rights-reserved' => array(
				'label' => __( 'All rights reserved', 'riff' ),
				'url'   => '',
			),
			'cc-by'               => $cc( 'by' ),
			'cc-by-sa'            => $cc( 'by-sa' ),
			'cc-by-nd'            => $cc( 'by-nd' ),
			'cc-by-nc'            => $cc( 'by-nc' ),
			'cc-by-nc-sa'         => $cc( 'by-nc-sa' ),
			'cc-by-nc-nd'         => $cc( 'by-nc-nd' ),
			'cc0'                 => array(
				'label' => 'CC0 1.0',
				'url'   => 'https://creativecommons.org/publicdomain/zero/1.0/',
			),
		);
	}

	/**
	 * Registers the meta on posts and on attachments, readable over REST by whoever may read the
	 * item and written by whoever may edit it.
	 *
	 * @since 6.17.0
	 */
	public static function register_meta(): void {
		$auth = static fn( $allowed, $key, $post_id ) => current_user_can( 'edit_post', (int) $post_id );
		$both = array(
			self::HOLDER    => array(
				'type'              => 'string',
				'default'           => '',
				'description'       => __( 'Who holds the rights: the artist, label or publisher. Empty means the author of the album\'s post.', 'riff' ),
				'sanitize_callback' => static fn( $value ) => mb_substr( sanitize_text_field( (string) $value ), 0, 200 ),
			),
			self::YEAR      => array(
				'type'              => 'integer',
				'default'           => 0,
				'description'       => __( 'The year the recording was first released, for the ℗ line. 0 for none.', 'riff' ),
				'sanitize_callback' => array( self::class, 'sanitize_year' ),
				'show_in_rest'      => array(
					'schema' => array(
						'minimum' => 0,
						'maximum' => 9999,
					),
				),
			),
			self::LICENSE   => array(
				'type'              => 'string',
				'default'           => self::DEFAULT_LICENSE,
				'description'       => __( 'The licence listeners may use the music under.', 'riff' ),
				'sanitize_callback' => array( self::class, 'sanitize_license' ),
				'show_in_rest'      => array(
					'schema' => array( 'enum' => array_keys( self::licenses() ) ),
				),
			),
			self::ATTESTED  => array(
				'type'              => 'object',
				'default'           => array(),
				'description'       => __( 'The uploader\'s statement that they own or control the rights: who made it, when, and a hash of the words they agreed to.', 'riff' ),
				'sanitize_callback' => array( self::class, 'sanitize_attested' ),
				'show_in_rest'      => array(
					'schema' => array(
						'type'                 => 'object',
						'properties'           => array(
							'user_id' => array( 'type' => 'integer' ),
							'time'    => array( 'type' => 'integer' ),
							'text'    => array( 'type' => 'string' ),
						),
						'additionalProperties' => false,
					),
				),
			),
			self::DOWNLOADS => array(
				'type'              => 'boolean',
				'default'           => true,
				'description'       => __( 'Whether listeners may download the files. Unset, they may as before.', 'riff' ),
				'sanitize_callback' => 'rest_sanitize_boolean',
			),
			self::UNTIL     => array(
				'type'              => 'string',
				'default'           => '',
				'description'       => __( 'When the music stops being available to listeners, in UTC. Empty for always.', 'riff' ),
				'sanitize_callback' => array( self::class, 'sanitize_until' ),
			),
		);
		$only = array(
			'attachment' => array(
				self::ISRC => array(
					'type'              => 'string',
					'default'           => '',
					'description'       => __( 'The track\'s International Standard Recording Code, as CC-XXX-YY-NNNNN; kept without hyphens.', 'riff' ),
					'sanitize_callback' => array( self::class, 'sanitize_isrc' ),
					'show_in_rest'      => array(
						'schema' => array( 'pattern' => '^$|^[A-Za-z]{2}-?[A-Za-z0-9]{3}-?[0-9]{2}-?[0-9]{5}$' ),
					),
				),
			),
			'post'       => array(
				self::UPC => array(
					'type'              => 'string',
					'default'           => '',
					'description'       => __( 'The album\'s UPC or EAN: 12 or 13 digits.', 'riff' ),
					'sanitize_callback' => array( self::class, 'sanitize_upc' ),
					'show_in_rest'      => array(
						'schema' => array( 'pattern' => '^$|^[0-9]{12,13}$' ),
					),
				),
			),
		);
		foreach ( array( 'post', 'attachment' ) as $type ) {
			foreach ( $both + $only[ $type ] as $key => $args ) {
				$rest = $args['show_in_rest'] ?? true;
				register_post_meta(
					$type,
					$key,
					array(
						'single'        => true,
						'auth_callback' => $auth,
						'show_in_rest'  => $rest,
					) + $args
				);
			}
		}
	}

	/**
	 * A year, or 0.
	 *
	 * @since 6.17.0
	 *
	 * @param mixed $value Value.
	 * @return int
	 */
	public static function sanitize_year( $value ): int {
		$year = absint( $value );
		return $year >= 1000 && $year <= 9999 ? $year : 0;
	}

	/**
	 * A licence's slug, or the default one for anything else.
	 *
	 * @since 6.17.0
	 *
	 * @param mixed $value Value.
	 * @return string
	 */
	public static function sanitize_license( $value ): string {
		$slug = sanitize_key( is_scalar( $value ) ? (string) $value : '' );
		return isset( self::licenses()[ $slug ] ) ? $slug : self::DEFAULT_LICENSE;
	}

	/**
	 * An ISRC without its hyphens, upper case, or empty for anything that isn't one.
	 *
	 * @since 6.17.0
	 *
	 * @param mixed $value Value, as CC-XXX-YY-NNNNN or without hyphens.
	 * @return string
	 */
	public static function sanitize_isrc( $value ): string {
		$isrc = strtoupper( str_replace( array( '-', ' ' ), '', is_scalar( $value ) ? trim( (string) $value ) : '' ) );
		return preg_match( '/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/', $isrc ) ? $isrc : '';
	}

	/**
	 * A UPC or EAN's digits, or empty.
	 *
	 * @since 6.17.0
	 *
	 * @param mixed $value Value.
	 * @return string
	 */
	public static function sanitize_upc( $value ): string {
		$upc = preg_replace( '/[\s-]/', '', is_scalar( $value ) ? (string) $value : '' );
		return preg_match( '/^[0-9]{12,13}$/', (string) $upc ) ? (string) $upc : '';
	}

	/**
	 * A time in UTC as `Y-m-d H:i:s`, from any date WordPress reads (an ISO 8601 date-time with its
	 * offset, say), or empty.
	 *
	 * @since 6.17.0
	 *
	 * @param mixed $value Value.
	 * @return string
	 */
	public static function sanitize_until( $value ): string {
		$value = is_scalar( $value ) ? trim( (string) $value ) : '';
		if ( '' === $value ) {
			return '';
		}
		$time = strtotime( $value );
		return false === $time ? '' : gmdate( 'Y-m-d H:i:s', $time );
	}

	/**
	 * The statement as kept: always made by whoever is saving it, now, unless it is the one
	 * already kept. Nobody makes it in someone else's name.
	 *
	 * @since 6.17.0
	 *
	 * @param mixed $value Value: an array with `text`, a hash or version of the words agreed to.
	 * @return array|string The statement, or empty to remove it.
	 */
	public static function sanitize_attested( $value ) {
		if ( self::$attesting && is_array( $value ) ) {
			return $value;
		}
		if ( ! is_array( $value ) || ! $value ) {
			return '';
		}
		$text = preg_replace( '/[^A-Za-z0-9:._-]/', '', (string) ( $value['text'] ?? '' ) );
		$text = '' !== $text ? substr( (string) $text, 0, 128 ) : self::statement_hash();
		$user = get_current_user_id();
		// A save that hands back the statement as it was keeps it as it was.
		if ( isset( $value['user_id'], $value['time'] ) && (int) $value['user_id'] > 0 && (int) $value['time'] > 0 && ( ! $user || (int) $value['user_id'] === $user ) ) {
			return array(
				'user_id' => (int) $value['user_id'],
				'time'    => min( time(), (int) $value['time'] ),
				'text'    => $text,
			);
		}
		if ( ! $user ) {
			return '';
		}
		return array(
			'user_id' => $user,
			'time'    => time(),
			'text'    => $text,
		);
	}

	/**
	 * The words an uploader agrees to.
	 *
	 * @since 6.17.0
	 *
	 * @return string
	 */
	public static function statement(): string {
		return __( 'I own or control the rights to this music, or have permission to publish it here.', 'riff' );
	}

	/**
	 * A hash of the words agreed to, as an attestation keeps it: what was said, not only that it was.
	 *
	 * @since 6.17.0
	 *
	 * @return string
	 */
	public static function statement_hash(): string {
		return 'sha256:' . hash( 'sha256', self::statement() );
	}

	/**
	 * Keeps the statement for a post or a track, made by a user now.
	 *
	 * @since 6.17.0
	 *
	 * @param int    $post_id Post or attachment ID.
	 * @param int    $user_id Who makes it.
	 * @param string $text    A hash or version of the words; the default statement's hash when empty.
	 * @return array The statement kept.
	 */
	public static function attest( int $post_id, int $user_id, string $text = '' ): array {
		$attested = array(
			'user_id' => $user_id,
			'time'    => time(),
			'text'    => '' !== $text ? substr( (string) preg_replace( '/[^A-Za-z0-9:._-]/', '', $text ), 0, 128 ) : self::statement_hash(),
		);
		// Kept as given: the sanitizer would make it the current user's.
		self::$attesting = true;
		try {
			update_post_meta( $post_id, self::ATTESTED, $attested );
		} finally {
			self::$attesting = false;
		}
		return $attested;
	}

	/**
	 * Whether a host asks uploaders to make the statement. Riff keeps and shows it either way.
	 *
	 * @since 6.17.0
	 *
	 * @return bool
	 */
	public static function attestation_required(): bool {
		/**
		 * Filters whether an uploader must state they own or control the rights before their music
		 * is published. Riff keeps the statement (`riff_attested`) and shows it; requiring it is the
		 * host's choice, and the host enforces it where its uploads arrive.
		 *
		 * @since 6.17.0
		 *
		 * @param bool $required Whether it is required. Default false.
		 */
		return (bool) apply_filters( 'riff_rights_attestation_required', false );
	}

	/**
	 * The post a track takes what it doesn't say from: the album's post it was uploaded to.
	 *
	 * @param int $post_id Post or attachment ID.
	 * @return int The album's post, or 0.
	 */
	private static function album_of( int $post_id ): int {
		if ( 'attachment' !== get_post_type( $post_id ) ) {
			return 0;
		}
		$parent = (int) get_post_field( 'post_parent', $post_id );
		return $parent && 'attachment' !== get_post_type( $parent ) ? $parent : 0;
	}

	/**
	 * One stored value, the item's own or else its album's, and whether either has one.
	 *
	 * @param int    $post_id Post or attachment ID.
	 * @param string $key     Meta key.
	 * @return array{0: bool, 1: mixed} Whether it is set, and its value.
	 */
	private static function stored( int $post_id, string $key ): array {
		if ( $post_id > 0 && metadata_exists( 'post', $post_id, $key ) ) {
			return array( true, get_post_meta( $post_id, $key, true ) );
		}
		$album = in_array( $key, self::INHERITED, true ) ? self::album_of( $post_id ) : 0;
		if ( $album && metadata_exists( 'post', $album, $key ) ) {
			return array( true, get_post_meta( $album, $key, true ) );
		}
		return array( false, null );
	}

	/**
	 * The rights of an album's post or a track.
	 *
	 * @since 6.17.0
	 *
	 * @param int $post_id Post or attachment ID.
	 * @return array {
	 *     @type string     $holder        Who holds the rights.
	 *     @type int|null   $year          The year for ℗, or null.
	 *     @type string     $license       The licence's slug.
	 *     @type string     $license_url   Its deed, or empty for all rights reserved.
	 *     @type string     $license_label Its name.
	 *     @type string     $isrc          A track's ISRC, or empty.
	 *     @type string     $upc           The album's UPC, or empty.
	 *     @type array|null $attested      The rights statement: user_id, time, text; or null.
	 *     @type bool       $explicit      Whether the track or its album says any of this, rather than
	 *                                     every value being a default.
	 * }
	 */
	public static function get( int $post_id ): array {
		$explicit           = false;
		$read               = static function ( string $key ) use ( $post_id, &$explicit ) {
			list( $set, $value ) = self::stored( $post_id, $key );
			// The default licence, chosen or not, says nothing new.
			if ( $set && '' !== $value && null !== $value && 0 !== $value && '0' !== $value && array() !== $value && ! ( self::LICENSE === $key && self::DEFAULT_LICENSE === $value ) ) {
				$explicit = true;
				return $value;
			}
			return null;
		};
		$holder             = trim( (string) $read( self::HOLDER ) );
		$year               = self::sanitize_year( $read( self::YEAR ) );
		$license            = self::sanitize_license( $read( self::LICENSE ) );
		$attested           = $read( self::ATTESTED );
		$album              = 'attachment' === get_post_type( $post_id ) ? self::album_of( $post_id ) : $post_id;
		$known              = self::licenses()[ $license ];
		$rights             = array(
			'holder'        => '' !== $holder ? $holder : self::owner( $album ? $album : $post_id ),
			'year'          => $year ? $year : null,
			'license'       => $license,
			'license_url'   => $known['url'],
			'license_label' => $known['label'],
			'isrc'          => 'attachment' === get_post_type( $post_id ) ? self::sanitize_isrc( get_post_meta( $post_id, self::ISRC, true ) ) : '',
			'upc'           => $album ? self::sanitize_upc( get_post_meta( $album, self::UPC, true ) ) : '',
			'attested'      => is_array( $attested ) && ! empty( $attested['user_id'] ) ? array(
				'user_id' => (int) $attested['user_id'],
				'time'    => (int) ( $attested['time'] ?? 0 ),
				'text'    => (string) ( $attested['text'] ?? '' ),
			) : null,
		);
		$rights['explicit'] = $explicit || '' !== $rights['isrc'] || '' !== $rights['upc'];

		/**
		 * Filters the rights of an album's post or a track: who holds them, the year, the licence,
		 * the ISRC and UPC, and the uploader's statement. A track has its album's unless it says
		 * otherwise. `explicit` is false while every value is a default, and Riff shows nothing then.
		 *
		 * @since 6.17.0
		 *
		 * @param array $rights  holder, year, license, license_url, license_label, isrc, upc, attested, explicit.
		 * @param int   $post_id Post or attachment ID.
		 */
		$filtered = apply_filters( 'riff_rights', $rights, $post_id );
		return is_array( $filtered ) ? $filtered + $rights : $rights;
	}

	/**
	 * The name rights default to: the post's author, or the site's.
	 *
	 * @param int $post_id Post ID.
	 * @return string
	 */
	private static function owner( int $post_id ): string {
		$author = (int) get_post_field( 'post_author', $post_id );
		$name   = $author ? (string) get_the_author_meta( 'display_name', $author ) : '';
		return '' !== $name ? $name : wp_strip_all_tags( html_entity_decode( (string) get_bloginfo( 'name' ), ENT_QUOTES, 'UTF-8' ) );
	}

	/**
	 * The rights as the track shape carries them to the player: what a listener reads, or null
	 * when nothing was set. Who made the statement stays on the server.
	 *
	 * @since 6.17.0
	 *
	 * @param int $post_id Attachment ID.
	 * @return array|null
	 */
	public static function for_track( int $post_id ): ?array {
		$rights = self::get( $post_id );
		if ( empty( $rights['explicit'] ) ) {
			return null;
		}
		return array(
			'holder'        => (string) $rights['holder'],
			'year'          => $rights['year'] ? (int) $rights['year'] : 0,
			'license'       => (string) $rights['license'],
			'license_url'   => esc_url_raw( (string) $rights['license_url'] ),
			'license_label' => (string) $rights['license_label'],
			'isrc'          => (string) $rights['isrc'],
			'attested'      => ! empty( $rights['attested'] ),
		);
	}

	/**
	 * Whether a user may download an album's or a track's files: always for someone who may edit
	 * it, otherwise as its Downloads switch says, which is on until it is turned off.
	 *
	 * @since 6.17.0
	 *
	 * @param int $post_id Post or attachment ID.
	 * @param int $user_id User ID, 0 for a visitor.
	 * @return bool
	 */
	public static function may_download( int $post_id, int $user_id ): bool {
		list( $set, $value ) = self::stored( $post_id, self::DOWNLOADS );
		$allowed             = ! $set || rest_sanitize_boolean( $value ) || user_can( $user_id, 'edit_post', $post_id );
		/**
		 * Filters whether a user may download an album's or a track's files. Where downloads are
		 * off, Riff shows no download link to anyone who can't edit the music.
		 *
		 * @since 6.17.0
		 *
		 * @param bool $allowed Whether they may. Default the Downloads switch, on until turned off.
		 * @param int  $post_id Post or attachment ID.
		 * @param int  $user_id User ID, 0 for a visitor.
		 */
		return (bool) apply_filters( 'riff_may_download', $allowed, $post_id, $user_id );
	}

	/**
	 * When an album or a track stops being available, as a Unix time, or 0 for never.
	 *
	 * @since 6.17.0
	 *
	 * @param int $post_id Post or attachment ID.
	 * @return int
	 */
	public static function until( int $post_id ): int {
		list( $set, $value ) = self::stored( $post_id, self::UNTIL );
		$value               = $set ? self::sanitize_until( $value ) : '';
		if ( '' === $value ) {
			return 0;
		}
		$time = strtotime( $value . ' UTC' );
		return false === $time ? 0 : $time;
	}

	/**
	 * Whether an album or a track is past its availability.
	 *
	 * @since 6.17.0
	 *
	 * @param int $post_id Post or attachment ID.
	 * @return bool
	 */
	public static function ended( int $post_id ): bool {
		$until = self::until( $post_id );
		return $until > 0 && $until <= time();
	}

	/**
	 * The pass this request carries, from the `riff-pass` query argument or the X-Riff-Pass header,
	 * or empty. Riff reads it and hands it on; what it means is the host's.
	 *
	 * @since 6.17.0
	 *
	 * @return string
	 */
	public static function pass(): string {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- a token passed to a filter, cleaned below.
		$pass = isset( $_GET[ self::PASS ] ) ? wp_unslash( $_GET[ self::PASS ] ) : ( isset( $_SERVER['HTTP_X_RIFF_PASS'] ) ? wp_unslash( $_SERVER['HTTP_X_RIFF_PASS'] ) : '' );
		// phpcs:enable
		return is_string( $pass ) ? substr( (string) preg_replace( '/[^A-Za-z0-9._~-]/', '', $pass ), 0, 512 ) : '';
	}

	/**
	 * Where the current request is answered, for riff_may_play: a page, REST, a feed, a protected
	 * file (audio) or an export.
	 *
	 * @since 6.17.0
	 *
	 * @return string
	 */
	public static function via(): string {
		if ( null !== self::$via ) {
			return self::$via;
		}
		if ( self::$rest > 0 || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return 'rest';
		}
		if ( isset( $GLOBALS['wp_query'] ) && $GLOBALS['wp_query'] instanceof \WP_Query && is_feed() ) {
			return 'feed';
		}
		return 'page';
	}

	/**
	 * Runs a callback with riff_may_play's `via` set, as serving a file and writing an export do.
	 *
	 * @since 6.17.0
	 *
	 * @param string   $via      audio or export.
	 * @param callable $callback What to run.
	 * @return mixed What it returns.
	 */
	public static function serving( string $via, callable $callback ) {
		$was       = self::$via;
		self::$via = $via;
		try {
			return $callback();
		} finally {
			self::$via = $was;
		}
	}

	/**
	 * Whether a user may play a track: the one gate every play goes through. A track past its
	 * availability is refused to anyone who can't edit it; then riff_may_play decides.
	 *
	 * @since 6.17.0
	 *
	 * @param int   $track_id Attachment ID.
	 * @param int   $user_id  User ID, 0 for a visitor.
	 * @param array $context  `pass` and `via`, read from the request when left out; `post`, the post it plays from.
	 * @return true|WP_Error
	 */
	public static function may_play( int $track_id, int $user_id, array $context = array() ) {
		$context += array(
			'pass' => self::pass(),
			'via'  => self::via(),
			'post' => 0,
		);
		$allowed  = true;
		if ( self::ended( $track_id ) && ! user_can( $user_id, 'edit_post', $track_id ) ) {
			$allowed = new WP_Error( 'riff_unavailable', __( 'No longer available', 'riff' ), array( 'status' => 410 ) );
		}
		/**
		 * Filters whether a user may play a track. Every play asks: the tracks on a page, over REST,
		 * in a feed or an export, and each request for a protected file. A refused track is listed
		 * as locked, with no file, and a WP_Error's message says why ("No longer available" for one
		 * past its riff_available_until). A host checks a pass here, from the `riff-pass` query
		 * argument or the X-Riff-Pass header.
		 *
		 * @since 6.17.0
		 *
		 * @param true|WP_Error $allowed  True, or why not.
		 * @param int           $track_id Attachment ID.
		 * @param int           $user_id  User ID, 0 for a visitor.
		 * @param array         $context  {
		 *     @type string $pass The pass the request carries, or empty.
		 *     @type string $via  page, audio, rest, feed or export.
		 *     @type int    $post The post the track plays from, or 0.
		 * }
		 */
		$allowed = apply_filters( 'riff_may_play', $allowed, $track_id, $user_id, $context );
		if ( true === $allowed || $allowed instanceof WP_Error ) {
			return $allowed;
		}
		return $allowed ? true : new WP_Error( 'riff_may_not_play', '', array( 'status' => 403 ) );
	}

	/**
	 * A playable address, as it is handed out: the host's hook to carry a pass or sign it its way.
	 *
	 * @since 6.17.0
	 *
	 * @param string $url      Address of the file or its streaming version.
	 * @param int    $track_id Attachment ID.
	 * @param array  $context  pass, via and post, as riff_may_play has them.
	 * @return string
	 */
	public static function play_url( string $url, int $track_id, array $context ): string {
		if ( '' === $url ) {
			return '';
		}
		/**
		 * Filters a playable address as Riff hands it out, once riff_may_play has allowed the play:
		 * on a page, over REST, in the Listen app. A protected file's signed address already carries
		 * the request's `riff-pass`, so the file's own request asks riff_may_play with it again. A
		 * host that signs addresses its own way (a CDN, private media) signs here, and can end the
		 * address sooner than Riff's own signature, which lasts at least Protect::TTL.
		 *
		 * @since 6.17.0
		 *
		 * @param string $url      Address.
		 * @param int    $track_id Attachment ID.
		 * @param array  $context  pass, via and post.
		 */
		return (string) apply_filters( 'riff_play_url', $url, $track_id, $context );
	}

	/**
	 * The links a host adds to a track's info in the player, such as one to report it.
	 *
	 * @since 6.17.0
	 *
	 * @param int $post_id Attachment ID.
	 * @return array[] Each with `label` and `url`.
	 */
	public static function links( int $post_id ): array {
		/**
		 * Filters the links shown with a track's info in the player, after its credits and rights:
		 * a host's "Report" link, say. Each is `label` and `url`; one without both, or with an
		 * address that isn't http or https, is left out. Empty by default.
		 *
		 * @since 6.17.0
		 *
		 * @param array[] $links   Links, each with `label` and `url`.
		 * @param int     $post_id Attachment ID; its album's post is its post_parent.
		 */
		return self::clean_links( apply_filters( 'riff_item_links', array(), $post_id ) );
	}

	/**
	 * Links as the track shape keeps them: each a label and an http or https address.
	 *
	 * @since 6.17.0
	 *
	 * @param mixed $links Links.
	 * @return array[]
	 */
	public static function clean_links( $links ): array {
		$out = array();
		foreach ( is_array( $links ) ? $links : array() as $link ) {
			$label = is_array( $link ) ? sanitize_text_field( (string) ( $link['label'] ?? '' ) ) : '';
			$url   = is_array( $link ) ? esc_url_raw( (string) ( $link['url'] ?? '' ), array( 'http', 'https' ) ) : '';
			if ( '' !== $label && '' !== $url ) {
				$out[] = array(
					'label' => $label,
					'url'   => $url,
				);
			}
		}
		return $out;
	}

	/**
	 * The share link of a post: its address, keeping a pass when given one.
	 *
	 * @since 6.17.0
	 *
	 * @param int    $post_id Post ID.
	 * @param string $pass    A pass to carry, or empty.
	 * @return string Unescaped; print it through esc_url().
	 */
	public static function share_url( int $post_id, string $pass = '' ): string {
		$url  = (string) get_permalink( $post_id );
		$pass = substr( (string) preg_replace( '/[^A-Za-z0-9._~-]/', '', $pass ), 0, 512 );
		if ( '' !== $url && '' !== $pass ) {
			$url = add_query_arg( self::PASS, $pass, $url );
		}
		/**
		 * Filters the link that shares a post. A host's expiring link opens it with its pass.
		 *
		 * @since 6.17.0
		 *
		 * @param string $url     Link.
		 * @param int    $post_id Post ID.
		 * @param string $pass    The pass it carries, or empty.
		 */
		return (string) apply_filters( 'riff_share_url', $url, $post_id, $pass );
	}

	/**
	 * Links the licence of a public album's post in its head, as HTML has it: `rel="license"`.
	 * Nothing for a post that chose none.
	 *
	 * @since 6.17.0
	 */
	public static function head(): void {
		$post = is_singular() ? get_queried_object() : null;
		if ( ! $post instanceof WP_Post || 'attachment' === $post->post_type || ! Protect::post_readable( $post ) ) {
			return;
		}
		$rights = self::get( $post->ID );
		if ( ! empty( $rights['explicit'] ) && '' !== (string) $rights['license_url'] ) {
			printf( '<link rel="license" href="%s">' . "\n", esc_url( (string) $rights['license_url'] ) );
		}
	}

	/**
	 * Leaves out of a feed an enclosure whose track the reader may not play.
	 *
	 * @since 6.17.0
	 *
	 * @param string $html The enclosure element.
	 * @return string
	 */
	public static function enclosure( $html ) {
		if ( ! is_string( $html ) || ! preg_match( '/(?:url|href)="([^"]+)"/', $html, $m ) ) {
			return $html;
		}
		$id = self::attachment_of( html_entity_decode( $m[1], ENT_QUOTES, 'UTF-8' ) );
		if ( $id && true !== self::may_play( $id, get_current_user_id(), array( 'via' => 'feed' ) ) ) {
			return '';
		}
		return $html;
	}

	/**
	 * The audio or video attachment an address names: a protected file's or an upload's.
	 *
	 * @param string $url Address.
	 * @return int Attachment ID, or 0.
	 */
	private static function attachment_of( string $url ): int {
		$query = array();
		wp_parse_str( (string) wp_parse_url( $url, PHP_URL_QUERY ), $query );
		$id = isset( $query[ Protect::QUERY ] ) ? absint( $query[ Protect::QUERY ] ) : attachment_url_to_postid( $url );
		return $id && in_array( strtok( (string) get_post_mime_type( $id ), '/' ), array( 'audio', 'video' ), true ) ? $id : 0;
	}

	/**
	 * A File block offering an album's music, or its zip, to download, is left out where downloads
	 * are off for whoever reads it.
	 *
	 * @since 6.17.0
	 *
	 * @param string $content The block's markup.
	 * @param array  $block   The block.
	 * @return string
	 */
	public static function file_block( $content, $block ) {
		$id = (int) ( $block['attrs']['id'] ?? 0 );
		if ( ! is_string( $content ) || ! $id || 'attachment' !== get_post_type( $id ) ) {
			return $content;
		}
		$mime = (string) get_post_mime_type( $id );
		if ( ! preg_match( '#^(audio|video)/|zip#', $mime ) ) {
			return $content;
		}
		return self::may_download( $id, get_current_user_id() ) ? $content : '';
	}
}
