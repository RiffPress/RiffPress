<?php
/**
 * What Riff adds to the Media Library: artwork for an audio or video file, and a video version for
 * an audio file.
 *
 * @since 4.0.0
 * @package Riff
 */

namespace Riff;

use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * Attachment fields.
 */
final class Media {

	/**
	 * Post meta on an audio attachment holding the ID of its video version.
	 *
	 * @since 4.0.0
	 */
	public const VIDEO_META = '_riff_video';

	/**
	 * Post meta on a video attachment holding the ID of its captions, a WebVTT file in the Media
	 * Library, shown by the player as the video block shows a track of its own.
	 *
	 * @since 4.33.0
	 */
	public const CAPTIONS_META = '_riff_captions';

	/**
	 * Tag names in Vorbis comments (FLAC, Ogg) and QuickTime atoms (M4A) whose ID3 name differs.
	 *
	 * @since 5.7.0
	 */
	private const ID3_KEYS = array(
		'albumartist'   => 'band',
		'album_artist'  => 'band',
		'date'          => 'year',
		'creation_date' => 'year',
		'tracknumber'   => 'track_number',
		'discnumber'    => 'part_of_a_set',
		'disc_number'   => 'part_of_a_set',
		'lyrics'        => 'unsynchronised_lyric',
	);

	/**
	 * The language tags getID3 reads, as ISO 639-2 codes, and the ISO 639-1 code a `lang`
	 * attribute wants for each; a code not here is kept as it is when it is already two letters.
	 */
	private const LANGUAGES = array(
		'eng' => 'en',
		'fra' => 'fr',
		'fre' => 'fr',
		'deu' => 'de',
		'ger' => 'de',
		'spa' => 'es',
		'ita' => 'it',
		'por' => 'pt',
		'nld' => 'nl',
		'dut' => 'nl',
		'swe' => 'sv',
		'nor' => 'no',
		'dan' => 'da',
		'fin' => 'fi',
		'pol' => 'pl',
		'ces' => 'cs',
		'cze' => 'cs',
		'rus' => 'ru',
		'ukr' => 'uk',
		'ell' => 'el',
		'gre' => 'el',
		'tur' => 'tr',
		'ara' => 'ar',
		'heb' => 'he',
		'hin' => 'hi',
		'jpn' => 'ja',
		'kor' => 'ko',
		'zho' => 'zh',
		'chi' => 'zh',
		'vie' => 'vi',
		'tha' => 'th',
		'ind' => 'id',
		'hun' => 'hu',
		'ron' => 'ro',
		'rum' => 'ro',
		'cat' => 'ca',
		'gle' => 'ga',
		'cym' => 'cy',
		'wel' => 'cy',
		'isl' => 'is',
		'ice' => 'is',
		'lat' => 'la',
	);

	/**
	 * Field errors from this request's save, by attachment ID and then field.
	 *
	 * @var array<int, array<string, string>>
	 */
	private static array $errors = array();

	/**
	 * Registers the meta and the Media Library field.
	 *
	 * @since 4.0.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'register_meta' ) );
		add_filter( 'attachment_fields_to_edit', array( self::class, 'fields' ), 10, 2 );
		add_filter( 'attachment_fields_to_save', array( self::class, 'save' ), 10, 2 );
		add_filter( 'wp_read_audio_metadata', array( self::class, 'tags' ), 10, 4 );
		add_filter( 'wp_read_audio_metadata', array( self::class, 'language' ), 10, 4 );
		add_action( 'wp_enqueue_media', array( self::class, 'enqueue' ), 10 );
		add_action( 'admin_enqueue_scripts', array( self::class, 'enqueue_media' ) );
		add_action( Catalog::ARTIST . '_edit_form_fields', array( self::class, 'artist_field' ) );
		add_action( 'edited_' . Catalog::ARTIST, array( self::class, 'save_artist' ) );
	}

	/**
	 * The Image field on an artist's edit screen in the Media Library: the picture that heads
	 * their page in the Listen block.
	 *
	 * @since 4.19.0
	 *
	 * @param \WP_Term $term Artist.
	 */
	public static function artist_field( $term ): void {
		if ( ! $term instanceof \WP_Term ) {
			return;
		}
		$image  = (int) get_term_meta( $term->term_id, Catalog::ARTIST_IMAGE, true );
		$picker = self::picker(
			$term->term_id,
			'riff_artist_image',
			$image,
			'',
			array(
				'type'    => 'image',
				'choose'  => __( 'Choose image', 'riff' ),
				'replace' => __( 'Replace image', 'riff' ),
				'remove'  => __( 'Remove image', 'riff' ),
				'button'  => __( 'Use as artist image', 'riff' ),
			),
			Catalog::ARTIST_IMAGE,
			'riff-artist-image'
		);
		printf(
			'<tr class="form-field"><th scope="row"><label for="riff-artist-image">%1$s</label></th><td>%2$s<p class="description">%3$s</p></td></tr>',
			esc_html__( 'Image', 'riff' ),
			$picker, // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped where it is built.
			esc_html__( 'An image from the Media Library for the top of this artist\'s page. Without one, their newest album\'s cover is used.', 'riff' )
		);
	}

	/**
	 * Saves the Image field. WordPress has checked the form's nonce and the right to edit the term
	 * before this runs.
	 *
	 * @since 4.19.0
	 *
	 * @param int $term_id Artist.
	 */
	public static function save_artist( $term_id ): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- the term edit form's own nonce, checked by core.
		if ( ! isset( $_POST[ Catalog::ARTIST_IMAGE ] ) || ! current_user_can( 'edit_term', (int) $term_id ) ) {
			return;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Missing, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- read through submitted().
		$id = self::submitted( wp_unslash( $_POST[ Catalog::ARTIST_IMAGE ] ), array( self::class, 'sanitize_image' ) );
		if ( $id > 0 ) {
			update_term_meta( (int) $term_id, Catalog::ARTIST_IMAGE, $id );
		} elseif ( 0 === $id ) {
			delete_term_meta( (int) $term_id, Catalog::ARTIST_IMAGE );
		}
	}

	/**
	 * Loads the Media Library on the attachment edit screen, which WordPress does itself only when
	 * the screen has a Featured image box.
	 *
	 * @since 4.13.0
	 */
	public static function enqueue_media(): void {
		$screen = get_current_screen();
		$post   = get_post();
		if ( $screen && 'post' === $screen->base && 'attachment' === $screen->post_type && $post && current_user_can( 'upload_files' ) ) {
			wp_enqueue_media( array( 'post' => $post->ID ) );
		}
		// An artist's edit screen, for its Image field.
		if ( $screen && 'term' === $screen->base && Catalog::ARTIST === $screen->taxonomy && current_user_can( 'upload_files' ) ) {
			wp_enqueue_media();
		}
	}

	/**
	 * Loads the pickers wherever the Media Library can open: the attachment edit screen, the
	 * Library's grid, and the post editors.
	 *
	 * @since 4.13.0
	 */
	public static function enqueue(): void {
		wp_enqueue_script( 'riff-media', RIFF_URL . 'assets/media.js', array( 'media-views' ), Player::version( 'assets/media.js' ), true );
		wp_add_inline_style( 'media-views', '.riff-pick{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.riff-pick [hidden]{display:none}.riff-pick img{width:60px;height:60px;object-fit:cover}.riff-pick-error{color:#d63638}' );
	}

	/**
	 * The video link is readable and writable over REST by anyone who can edit the attachment.
	 *
	 * @since 4.0.0
	 */
	public static function register_meta(): void {
		register_post_meta(
			'attachment',
			self::VIDEO_META,
			array(
				'type'              => 'integer',
				'single'            => true,
				'default'           => 0,
				'show_in_rest'      => true,
				'sanitize_callback' => array( self::class, 'sanitize_video' ),
				'auth_callback'     => static fn( $allowed, $key, $post_id ) => current_user_can( 'edit_post', $post_id ),
			)
		);
		register_post_meta(
			'attachment',
			self::CAPTIONS_META,
			array(
				'type'              => 'integer',
				'single'            => true,
				'default'           => 0,
				'show_in_rest'      => true,
				'sanitize_callback' => array( self::class, 'sanitize_captions' ),
				'auth_callback'     => static fn( $allowed, $key, $post_id ) => current_user_can( 'edit_post', $post_id ),
			)
		);
	}

	/**
	 * Keeps the language a file's tags name, which WordPress reads but does not keep: ID3's TLAN
	 * frame, a Vorbis comment's LANGUAGE. It is kept as `language` in the attachment's metadata,
	 * as a two-letter code where the tag's three-letter one has a plain equivalent, and the player
	 * marks a track's title with it where it is not the page's language.
	 *
	 * @since 4.33.0
	 *
	 * @param array       $metadata    What WordPress keeps.
	 * @param string      $file        The file.
	 * @param string|null $file_format Its format.
	 * @param array       $data        Everything getID3 read.
	 * @return array
	 */
	public static function language( $metadata, $file, $file_format, $data ) {
		unset( $file, $file_format );
		if ( ! is_array( $metadata ) || ! is_array( $data ) ) {
			return $metadata;
		}
		foreach ( (array) ( $data['tags'] ?? array() ) as $tags ) {
			$code = is_array( $tags ) ? ( $tags['language'][0] ?? '' ) : '';
			$code = self::language_code( is_scalar( $code ) ? (string) $code : '' );
			if ( '' !== $code ) {
				$metadata['language'] = $code;
				break;
			}
		}
		return $metadata;
	}

	/**
	 * Keeps the tags of a file without ID3, such as FLAC, Ogg and M4A, which WordPress reads but
	 * does not keep, under the names ID3 gives them, so the catalog files the track by its artist
	 * and album. A tag WordPress already kept is left as it is, so this does nothing once core
	 * keeps them (Core #NNNNN). The language is left to language().
	 *
	 * @since 5.7.0
	 *
	 * @param array       $metadata    What WordPress keeps.
	 * @param string      $file        The file.
	 * @param string|null $file_format Its format.
	 * @param array       $data        Everything getID3 read.
	 * @return array
	 */
	public static function tags( $metadata, $file, $file_format, $data ) {
		unset( $file, $file_format );
		if ( ! is_array( $metadata ) || ! is_array( $data ) || ! empty( $data['id3v2']['comments'] ) || ! empty( $data['id3v1']['comments'] ) ) {
			return $metadata;
		}
		foreach ( (array) ( $data['tags'] ?? array() ) as $tags ) {
			if ( empty( $tags ) || ! is_array( $tags ) ) {
				continue;
			}
			foreach ( $tags as $key => $list ) {
				$key = self::ID3_KEYS[ $key ] ?? $key;
				if ( in_array( $key, array( 'length', 'picture', 'language' ), true ) || isset( $metadata[ $key ] ) || empty( $list ) ) {
					continue;
				}
				$metadata[ $key ] = is_array( $list ) ? wp_kses_post_deep( reset( $list ) ) : wp_kses_post( $list );
			}
			break;
		}
		return $metadata;
	}

	/**
	 * A language tag as a `lang` attribute takes it, from what a file's tag says, or empty.
	 *
	 * @since 4.33.0
	 *
	 * @param string $code The tag's value: an ISO 639-2 code (eng), an ISO 639-1 one (en), or a BCP 47 tag (en-GB).
	 * @return string
	 */
	public static function language_code( string $code ): string {
		$code = strtolower( trim( $code ) );
		if ( '' === $code || 'und' === $code || 'xxx' === $code ) {
			return '';
		}
		if ( isset( self::LANGUAGES[ $code ] ) ) {
			return self::LANGUAGES[ $code ];
		}
		return preg_match( '/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/', $code ) ? $code : '';
	}

	/**
	 * Keeps only IDs of image attachments.
	 *
	 * @since 4.0.0
	 * @param mixed $value Submitted value.
	 * @return int
	 */
	public static function sanitize_image( $value ): int {
		$id = absint( $value );
		return $id && wp_attachment_is_image( $id ) ? $id : 0;
	}

	/**
	 * Keeps only IDs of video attachments.
	 *
	 * @since 4.0.0
	 * @param mixed $value Submitted value.
	 * @return int
	 */
	public static function sanitize_video( $value ): int {
		$id = absint( $value );
		return $id && str_starts_with( (string) get_post_mime_type( $id ), 'video/' ) ? $id : 0;
	}

	/**
	 * Keeps only IDs of WebVTT attachments, for captions.
	 *
	 * @since 4.33.0
	 * @param mixed $value Submitted value.
	 * @return int
	 */
	public static function sanitize_captions( $value ): int {
		$id = absint( $value );
		return $id && 'text/vtt' === (string) get_post_mime_type( $id ) ? $id : 0;
	}

	/**
	 * Adds "Artwork" to audio and video files in the Media Library, "Video version" to audio, and
	 * "Captions" to video.
	 *
	 * Artwork is the file's featured image, the same thing WordPress sets from a tag inside the file
	 * on upload, so a cover set here shows in the player, the queue and on the lock screen.
	 *
	 * @since 4.0.0
	 * @param array   $fields Attachment fields.
	 * @param WP_Post $post   Attachment.
	 * @return array
	 */
	public static function fields( $fields, $post ) {
		if ( ! $post instanceof WP_Post ) {
			return $fields;
		}
		$mime = (string) $post->post_mime_type;
		if ( ! str_starts_with( $mime, 'audio/' ) && ! str_starts_with( $mime, 'video/' ) ) {
			return $fields;
		}
		$errors             = self::errors( $post->ID );
		$fields['riff_art'] = array(
			'label'        => __( 'Artwork', 'riff' ),
			// Artwork is the featured image, and the edit screen's own Featured image box saves after
			// this field, so there the box is the picker.
			'show_in_edit' => ! self::has_featured_image_box( $post ),
			'input'        => 'html',
			'html'         => self::picker(
				$post->ID,
				'riff_art',
				(int) get_post_thumbnail_id( $post->ID ),
				$errors['riff_art'] ?? '',
				array(
					'type'    => 'image',
					'choose'  => __( 'Choose artwork', 'riff' ),
					'replace' => __( 'Replace artwork', 'riff' ),
					'remove'  => __( 'Remove artwork', 'riff' ),
					'button'  => __( 'Use as artwork', 'riff' ),
				)
			),
			'helps'        => __( 'An image from the Media Library, chosen or entered by address or ID. Without one, the post\'s featured image is used, and failing that a cover is drawn.', 'riff' ),
		);
		if ( str_starts_with( $mime, 'video/' ) ) {
			$fields['riff_captions'] = array(
				'label' => __( 'Captions', 'riff' ),
				'input' => 'html',
				'html'  => self::picker(
					$post->ID,
					'riff_captions',
					(int) get_post_meta( $post->ID, self::CAPTIONS_META, true ),
					$errors['riff_captions'] ?? '',
					array(
						'type'    => 'text/vtt',
						'choose'  => __( 'Choose captions', 'riff' ),
						'replace' => __( 'Replace captions', 'riff' ),
						'remove'  => __( 'Remove captions', 'riff' ),
						'button'  => __( 'Use as captions', 'riff' ),
					)
				),
				'helps' => __( 'A WebVTT file (.vtt) from the Media Library, chosen or entered by address or ID. Listeners can turn the captions on in Now Playing, as the video block shows a text track of its own.', 'riff' ),
			);
			return $fields;
		}
		$fields['riff_video'] = array(
			'label' => __( 'Video version', 'riff' ),
			'input' => 'html',
			'html'  => self::picker(
				$post->ID,
				'riff_video',
				(int) get_post_meta( $post->ID, self::VIDEO_META, true ),
				$errors['riff_video'] ?? '',
				array(
					'type'    => 'video',
					'choose'  => __( 'Choose video', 'riff' ),
					'replace' => __( 'Replace video', 'riff' ),
					'remove'  => __( 'Remove video version', 'riff' ),
					'button'  => __( 'Use as video version', 'riff' ),
				)
			),
			'helps' => __( 'A video from the Media Library, chosen or entered by address or ID. Listeners can switch between the song and the video while it plays.', 'riff' ),
		);
		return $fields;
	}

	/**
	 * A picker: the current selection, the address field it fills in, and buttons to choose or
	 * remove. The address field still takes a typed address or ID, and works without the script.
	 *
	 * @since 4.13.0
	 * @param int    $post_id  Attachment being edited.
	 * @param string $field    Field key.
	 * @param int    $selected Selected attachment ID, or 0.
	 * @param string $error    Error from the last save, or ''.
	 * @param array  $strings  The media type to pick and the button labels.
	 * @return string
	 * @param string $name     The field's name; the attachment form's by default.
	 * @param string $id       The field's ID; the attachment form's by default.
	 */
	private static function picker( int $post_id, string $field, int $selected, string $error, array $strings, string $name = '', string $id = '' ): string {
		$url  = $selected ? (string) wp_get_attachment_url( $selected ) : '';
		$id   = '' !== $id ? $id : "attachments-$post_id-$field";
		$name = '' !== $name ? $name : "attachments[$post_id][$field]";
		$html = '<span class="riff-pick-preview">';
		if ( $selected ) {
			$html .= 'image' === $strings['type']
				? wp_get_attachment_image( $selected, 'thumbnail', false, array( 'alt' => '' ) )
				: esc_html( get_the_title( $selected ) );
		}
		$html .= '</span>';
		$html .= sprintf(
			'<input type="text" class="text" id="%1$s" name="%2$s" value="%3$s"%4$s />',
			esc_attr( $id ),
			esc_attr( $name ),
			esc_attr( $url ),
			$error ? ' aria-invalid="true" aria-describedby="' . esc_attr( $id ) . '-error"' : ''
		);
		// Someone who cannot upload cannot open the Media Library either, but can still type an ID.
		if ( current_user_can( 'upload_files' ) ) {
			$html .= sprintf( '<button type="button" class="button" data-riff-action="choose">%s</button>', esc_html( $selected ? $strings['replace'] : $strings['choose'] ) );
			$html .= sprintf( '<button type="button" class="button-link button-link-delete" data-riff-action="remove"%2$s>%1$s</button>', esc_html( $strings['remove'] ), $selected ? '' : ' hidden' );
		}
		if ( $error ) {
			$html .= sprintf( '<p class="riff-pick-error" id="%1$s-error" role="alert">%2$s</p>', esc_attr( $id ), esc_html( $error ) );
		}
		return sprintf(
			'<div class="riff-pick" data-riff-pick="%1$s" data-riff-choose="%2$s" data-riff-replace="%3$s" data-riff-button="%4$s">%5$s</div>',
			esc_attr( $strings['type'] ),
			esc_attr( $strings['choose'] ),
			esc_attr( $strings['replace'] ),
			esc_attr( $strings['button'] ),
			$html
		);
	}

	/**
	 * Whether the attachment edit screen shows WordPress's Featured image box for this file, by the
	 * same test the screen uses.
	 *
	 * @since 4.13.0
	 * @param WP_Post $post Attachment.
	 * @return bool
	 */
	private static function has_featured_image_box( WP_Post $post ): bool {
		$type = wp_attachment_is( 'audio', $post ) ? 'attachment:audio' : 'attachment:video';
		return current_user_can( 'upload_files' ) && (
			( current_theme_supports( 'post-thumbnails', 'attachment' ) && post_type_supports( 'attachment', 'thumbnail' ) ) ||
			post_type_supports( $type, 'thumbnail' ) ||
			current_theme_supports( 'post-thumbnails', $type )
		);
	}

	/**
	 * Saves the fields, accepting a Media Library URL or an attachment ID.
	 *
	 * An empty field removes the selection. Anything else that is not an image (for artwork) or a
	 * video (for the video version) in the Media Library leaves the selection as it was and shows
	 * an error on the field the next time it is drawn.
	 *
	 * @since 4.0.0
	 * @since 4.13.0 An invalid value keeps the current selection instead of removing it.
	 * @param array $post       Attachment data being saved.
	 * @param array $attachment Submitted fields.
	 * @return array
	 */
	public static function save( $post, $attachment ) {
		if ( ! isset( $post['ID'] ) ) {
			return $post;
		}
		$post_id = (int) $post['ID'];
		$errors  = array();
		if ( isset( $attachment['riff_art'] ) ) {
			$id = self::submitted( $attachment['riff_art'], array( self::class, 'sanitize_image' ) );
			if ( $id > 0 ) {
				set_post_thumbnail( $post_id, $id );
			} elseif ( 0 === $id ) {
				delete_post_thumbnail( $post_id );
			} else {
				$errors['riff_art'] = __( 'That is not an image in the Media Library, so the artwork was not changed.', 'riff' );
			}
		}
		if ( isset( $attachment['riff_video'] ) ) {
			$id = self::submitted( $attachment['riff_video'], array( self::class, 'sanitize_video' ) );
			if ( $id > 0 ) {
				update_post_meta( $post_id, self::VIDEO_META, $id );
			} elseif ( 0 === $id ) {
				delete_post_meta( $post_id, self::VIDEO_META );
			} else {
				$errors['riff_video'] = __( 'That is not a video in the Media Library, so the video version was not changed.', 'riff' );
			}
		}
		if ( isset( $attachment['riff_captions'] ) ) {
			$id = self::submitted( $attachment['riff_captions'], array( self::class, 'sanitize_captions' ) );
			if ( $id > 0 ) {
				update_post_meta( $post_id, self::CAPTIONS_META, $id );
			} elseif ( 0 === $id ) {
				delete_post_meta( $post_id, self::CAPTIONS_META );
			} else {
				$errors['riff_captions'] = __( 'That is not a WebVTT file in the Media Library, so the captions were not changed.', 'riff' );
			}
		}
		self::$errors[ $post_id ] = $errors;
		// The attachment edit screen redirects after saving, so the errors outlive this request.
		if ( $errors ) {
			set_transient( self::error_key( $post_id ), $errors, MINUTE_IN_SECONDS );
		} else {
			delete_transient( self::error_key( $post_id ) );
		}
		return $post;
	}

	/**
	 * Reads a submitted field.
	 *
	 * @param mixed    $value    Submitted value: a Media Library URL, an attachment ID, or empty.
	 * @param callable $sanitize Keeps the ID if it is the right type of attachment.
	 * @return int The attachment ID, 0 for an empty field, or -1 for anything else.
	 */
	private static function submitted( $value, callable $sanitize ): int {
		$value = trim( (string) $value );
		if ( '' === $value ) {
			return 0;
		}
		$id = ctype_digit( $value ) ? (int) $value : attachment_url_to_postid( esc_url_raw( $value ) );
		$id = $sanitize( $id );
		return $id ? $id : -1;
	}

	/**
	 * The errors from the last save of an attachment by the current user, shown once.
	 *
	 * @param int $post_id Attachment.
	 * @return array<string, string>
	 */
	private static function errors( int $post_id ): array {
		if ( ! isset( self::$errors[ $post_id ] ) ) {
			$errors = get_transient( self::error_key( $post_id ) );
			delete_transient( self::error_key( $post_id ) );
			self::$errors[ $post_id ] = is_array( $errors ) ? $errors : array();
		}
		return self::$errors[ $post_id ];
	}

	/**
	 * The transient holding an attachment's save errors for the current user.
	 *
	 * @param int $post_id Attachment.
	 * @return string
	 */
	private static function error_key( int $post_id ): string {
		return 'riff_media_errors_' . get_current_user_id() . '_' . $post_id;
	}
}
