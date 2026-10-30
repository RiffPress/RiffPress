<?php
/**
 * Default artwork: a cover drawn for any post with tracks that has no image of its own.
 *
 * @since 4.0.0
 * @package Riff
 */

namespace Riff\Listen;

use WP;
use WP_Post;
use WP_REST_Request;
use WP_Term;

use Riff\Catalog;
use Riff\Library;
use Riff\Player;

defined( 'ABSPATH' ) || exit;

/**
 * Drawn covers.
 *
 * A site's own images always win: the post's featured image, or the file's artwork set in the
 * Media Library. When there is neither, the player draws a cover. Every cover is the same object,
 * a record, and what changes is what the record carries: one groove per track, each as wide as
 * the track is long, textured by the track's own level data when it has any; the title in
 * EB Garamond and the artist in Inter, as wordpress.org sets them; a ground, an accent and a
 * layout chosen from the post's slug, so the same post draws the same cover on any site, through
 * any reseed. The palette is wordpress.org's own. Served by WordPress at ?riff-art={post}, as SVG
 * with the two fonts embedded, so it is sharp at any size and costs nothing to store.
 */
final class Art {

	/**
	 * The query variable that serves a cover.
	 *
	 * @since 4.0.0
	 */
	public const QUERY = 'riff-art';

	/**
	 * The contact sheet, every ground, accent and layout at once, for whoever can edit posts.
	 *
	 * @since 4.3.0
	 */
	public const SHEET = 'sheet';

	/**
	 * The folder in uploads where a cover is kept once drawn, one folder for each drawing.
	 *
	 * @since 5.7.0
	 */
	public const DIR = 'riff-art';

	/**
	 * The option naming the drawing: what changes when anything a cover draws from does.
	 *
	 * @since 5.7.0
	 */
	public const STAMP = 'riff_art_stamp';

	/**
	 * The option holding when anything a cover draws from last changed, in seconds, so a cover
	 * drawn from what was there before is not kept.
	 *
	 * @since 5.7.0
	 */
	public const CHANGED = 'riff_art_changed';

	/**
	 * The drawing's version, for this request, by site.
	 *
	 * @var string[]
	 */
	private static $version = array();

	/**
	 * Hooks the query variable and the handler, and what draws the covers again.
	 *
	 * @since 4.0.0
	 * @since 5.7.0 And what draws the covers again.
	 */
	public static function register(): void {
		add_filter( 'query_vars', array( self::class, 'query_vars' ) );
		add_action( 'parse_request', array( self::class, 'serve' ) );
		add_filter( 'riff_track', array( self::class, 'track_art' ), 10, 3 );
		// A cover draws from its post or album, its tracks' tags and levels, and which posts are
		// public, so a change to any of these draws every cover again when it is next asked for.
		add_action( 'save_post', array( self::class, 'saved' ), 10, 2 );
		add_action( 'post_updated', array( self::class, 'updated' ), 10, 3 );
		add_action( 'before_delete_post', array( self::class, 'deleting' ) );
		add_action( 'attachment_updated', array( self::class, 'moved' ), 10, 3 );
		add_action( 'wp_media_attach_action', array( self::class, 'attached' ), 10, 2 );
		add_action( 'delete_attachment', array( self::class, 'removed' ) );
		add_action( 'set_object_terms', array( self::class, 'filed' ), 10, 4 );
		add_action( 'edited_' . Catalog::ALBUM, array( self::class, 'redraw' ) );
		add_action( 'delete_' . Catalog::ALBUM, array( self::class, 'redraw' ) );
		foreach ( array( 'added', 'updated', 'deleted' ) as $did ) {
			add_action( "{$did}_post_meta", array( self::class, 'meta' ), 10, 3 );
			add_action( "{$did}_term_meta", array( self::class, 'meta' ), 10, 3 );
		}
	}

	/**
	 * A track with no image anywhere gets its post's drawn cover.
	 *
	 * @since 4.0.0
	 * @param array $track         Track.
	 * @param int   $attachment_id Attachment ID, or 0.
	 * @param int   $post_id       Post ID, or 0.
	 * @return array
	 */
	public static function track_art( $track, $attachment_id, $post_id ) {
		if ( is_array( $track ) && empty( $track['art'] ) && $post_id ) {
			$track['art'] = self::art( (int) $post_id );
		}
		return $track;
	}

	/**
	 * A post with no image of its own is listed with its drawn cover.
	 *
	 * @since 4.0.0
	 * @param array   $item Library item.
	 * @param WP_Post $post Post.
	 * @return array
	 */
	public static function item_art( $item, $post ) {
		if ( is_array( $item ) && empty( $item['art'] ) && ! empty( $item['count'] ) && $post instanceof WP_Post ) {
			$item['art'] = self::art( $post->ID );
		}
		return $item;
	}

	/**
	 * Whether a track's artwork is one Riff drew, or nothing at all, rather than an image of the
	 * site's own.
	 *
	 * @since 4.32.0
	 *
	 * @param array $art Artwork list, as a track carries it.
	 * @return bool
	 */
	public static function drawn( array $art ): bool {
		$src = $art ? (string) ( end( $art )['src'] ?? '' ) : '';
		return '' === $src || '' !== self::which( $src );
	}

	/**
	 * Which drawn cover an address is, at ?riff-art or kept in uploads, or empty for an image of
	 * the site's own.
	 *
	 * @param string $src The cover's address.
	 * @return string A post ID, album-<term ID>, or empty.
	 */
	private static function which( string $src ): string {
		parse_str( (string) wp_parse_url( $src, PHP_URL_QUERY ), $query );
		if ( ! empty( $query[ self::QUERY ] ) ) {
			return (string) $query[ self::QUERY ];
		}
		return preg_match( '#/' . self::DIR . '/[0-9a-f]{8}/((?:album-)?\d+)\.svg$#', (string) wp_parse_url( $src, PHP_URL_PATH ), $m ) ? $m[1] : '';
	}

	/**
	 * An album's artwork: its first track's own image when it has one, else a cover drawn for the
	 * album itself, with its own name, artist and track count. An album with no image and no
	 * post used to stay a grey square, and one on a post took the post's drawn cover, with the
	 * post's title and count on it.
	 *
	 * @since 4.32.0
	 *
	 * @param int   $term_id The album's term ID.
	 * @param array $art     The first track's artwork as the player shows it.
	 * @return array List of { src, sizes }.
	 */
	public static function album_art( int $term_id, array $art ): array {
		return self::drawn( $art ) ? self::album( $term_id ) : $art;
	}

	/**
	 * The drawn cover of an album, as the artwork list the player reads.
	 *
	 * @since 4.32.0
	 *
	 * @param int $term_id The album's term ID.
	 * @return array List of { src, sizes }.
	 */
	public static function album( int $term_id ): array {
		if ( ! $term_id ) {
			return array();
		}
		$term   = get_term( $term_id, Catalog::ALBUM );
		$name   = $term instanceof WP_Term ? html_entity_decode( (string) $term->name, ENT_QUOTES, 'UTF-8' ) : '';
		$artist = (string) get_term_meta( $term_id, Catalog::ALBUM_ARTIST, true );
		return array(
			array(
				'src'   => self::address( 'album-' . $term_id ),
				'sizes' => '1024x1024',
				'type'  => 'image/svg+xml',
				'alt'   => self::alt( $name, $artist ),
			),
		);
	}

	/**
	 * What a drawn cover shows, for a screen reader: the album and the artist it names.
	 *
	 * @since 4.33.0
	 *
	 * @param string $title  The album's, or the post's, name.
	 * @param string $artist The artist, or empty.
	 * @return string
	 */
	public static function alt( string $title, string $artist ): string {
		if ( '' === $title ) {
			return '';
		}
		/* translators: 1: an album or post, 2: its artist. */
		return '' !== $artist ? sprintf( __( 'Cover of %1$s by %2$s', 'riff' ), $title, $artist ) : sprintf( /* translators: %s: an album or post. */ __( 'Cover of %s', 'riff' ), $title );
	}

	/**
	 * Draws the cover for an album: its name, its artist and the tracks the requester may see,
	 * read through the tracks route so a private album stays private. The palette and layout come
	 * from the term's slug, as a post's come from its own.
	 *
	 * @since 4.32.0
	 *
	 * @param int $term_id The album's term ID.
	 * @return string|null SVG document, or null for no album the requester may see.
	 */
	public static function album_svg( int $term_id ): ?string {
		$term = get_term( $term_id, Catalog::ALBUM );
		if ( ! $term instanceof WP_Term ) {
			return null;
		}
		$request = new WP_REST_Request( 'GET', '/' . Library::REST . '/tracks' );
		$request->set_query_params(
			array(
				'album'    => $term_id,
				'per_page' => 100,
			)
		);
		$data   = rest_do_request( $request )->get_data();
		$tracks = is_array( $data['items'] ?? null ) ? $data['items'] : array();
		if ( ! $tracks ) {
			return null;
		}
		$duration = 0.0;
		foreach ( $tracks as $track ) {
			$duration += (float) ( $track['duration'] ?? 0 );
		}
		$item     = array(
			'title'    => html_entity_decode( (string) $term->name, ENT_QUOTES, 'UTF-8' ),
			'artist'   => (string) get_term_meta( $term_id, Catalog::ALBUM_ARTIST, true ),
			'count'    => (int) ( $data['total'] ?? count( $tracks ) ),
			'duration' => $duration,
		);
		$seed     = crc32( (string) $term->slug );
		$palettes = Cover::palettes();
		$layouts  = Cover::layouts();
		return Cover::draw(
			$item,
			$tracks,
			$palettes[ $seed % count( $palettes ) ],
			$layouts[ intdiv( $seed, count( $palettes ) ) % count( $layouts ) ]
		);
	}

	/**
	 * Tells the player where the Listen script is, for pages that hold the block.
	 *
	 * @since 4.0.0
	 * @param array $data Player data.
	 * @return array
	 */
	public static function player_data( $data ) {
		$data['assets']['app'] = add_query_arg( 'ver', Player::version( 'features/listen/app.js' ), RIFF_URL . 'features/listen/app.js' );
		return $data;
	}

	/**
	 * Lets WordPress read ?riff-art.
	 *
	 * @since 4.0.0
	 * @param array $vars Public query variables.
	 * @return array
	 */
	public static function query_vars( $vars ) {
		$vars[] = self::QUERY;
		return $vars;
	}

	/**
	 * The address of a post's generated cover.
	 *
	 * @since 4.0.0
	 * @param int $post_id Post ID.
	 * @return string
	 */
	public static function url( int $post_id ): string {
		return self::address( (string) $post_id );
	}

	/**
	 * A drawn cover's address: the file in uploads once it has been drawn, which the web server
	 * serves to everyone without starting WordPress, and until then ?riff-art, which draws it and
	 * keeps the file. Either way with the version of the drawing in it, so a browser that keeps a
	 * cover for a day fetches the new one when the drawing changes.
	 *
	 * @since 5.2.3
	 * @since 5.7.0 The file in uploads once there is one.
	 *
	 * @param string $drawn A post ID, or album-<term ID>.
	 * @return string
	 */
	private static function address( string $drawn ): string {
		$file = self::file( $drawn );
		if ( $file && is_file( $file['path'] ) ) {
			return $file['url'];
		}
		return add_query_arg(
			array(
				self::QUERY => $drawn,
				'ver'       => self::version(),
			),
			home_url( '/' )
		);
	}

	/**
	 * The version of the drawing: from what the drawing code says, not when its files were
	 * written, as a deploy writes every file anew; and from the stamp, which moves when anything a
	 * cover draws from does.
	 *
	 * @since 5.7.0
	 *
	 * @return string
	 */
	private static function version(): string {
		$site = get_current_blog_id();
		if ( ! isset( self::$version[ $site ] ) ) {
			self::$version[ $site ] = substr( md5( RIFF_VERSION . (string) md5_file( __DIR__ . '/class-cover.php' ) . (string) md5_file( __FILE__ ) . (string) get_option( self::STAMP, '' ) ), 0, 8 );
		}
		return self::$version[ $site ];
	}

	/**
	 * Where a cover is kept, in this drawing's folder, or null where none can be: without uploads,
	 * or with uploads somewhere a folder can't be listed, as on S3, where a cover that must go
	 * could not be found to delete.
	 *
	 * @param string $drawn A post ID, or album-<term ID>.
	 * @return array|null `{ path, url }`.
	 */
	private static function file( string $drawn ): ?array {
		$uploads = wp_upload_dir( null, false );
		if ( ! empty( $uploads['error'] ) || wp_is_stream( $uploads['basedir'] ) || ! preg_match( '/^(album-)?\d+$/', $drawn ) ) {
			return null;
		}
		$name = self::DIR . '/' . self::version() . '/' . $drawn . '.svg';
		return array(
			'path' => trailingslashit( $uploads['basedir'] ) . $name,
			'url'  => trailingslashit( $uploads['baseurl'] ) . $name,
		);
	}

	/**
	 * Keeps a drawn cover where the next page will link to it. Written whole and then moved into
	 * place, so the web server never serves half of one; and taken away again when something it
	 * draws from changed while it was drawn, as the cover is then of what was there before.
	 *
	 * @param string $drawn A post ID, or album-<term ID>.
	 * @param string $svg   The cover.
	 * @param float  $since When it began to be drawn.
	 */
	private static function keep( string $drawn, string $svg, float $since ): void {
		$file = self::file( $drawn );
		if ( ! $file || ! wp_mkdir_p( dirname( $file['path'] ) ) ) {
			return;
		}
		$part = $file['path'] . '.' . wp_generate_password( 6, false ) . '.part';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents, WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- a cover drawn here, written once and moved into place.
		if ( false === file_put_contents( $part, $svg ) || ! @rename( $part, $file['path'] ) ) {
			wp_delete_file( $part );
			return;
		}
		// After the file is in place, so a change made while it was written is seen here, or its
		// redraw() finds the file.
		wp_cache_delete( self::CHANGED, 'options' );
		if ( (float) get_option( self::CHANGED, 0 ) >= $since ) {
			wp_delete_file( $file['path'] );
		}
	}

	/**
	 * Draws the covers again when they are next asked for: a new stamp, so a new folder. The
	 * folder before stays, as a page cached a moment ago still links to it; any older goes. With
	 * $all, every folder goes, for a cover that must not be seen again.
	 *
	 * @since 5.7.0
	 *
	 * @param bool $all Whether the folder before goes too.
	 */
	public static function redraw( $all = false ): void {
		$all = true === $all;
		// Every change, so a cover being drawn from what was there before is not kept.
		update_option( self::CHANGED, (string) microtime( true ), false );
		$was     = self::version();
		$uploads = wp_upload_dir( null, false );
		$base    = empty( $uploads['error'] ) && ! wp_is_stream( $uploads['basedir'] ) ? trailingslashit( $uploads['basedir'] ) . self::DIR : '';
		// Nothing drawn since the last change has been seen, so there is nothing to draw again: an
		// import saving a hundred tracks moves the stamp once.
		if ( ! $all && '' !== $base && ! is_dir( "$base/$was" ) ) {
			return;
		}
		update_option( self::STAMP, wp_generate_password( 8, false ), false );
		unset( self::$version[ get_current_blog_id() ] );
		if ( '' === $base ) {
			return;
		}
		foreach ( (array) glob( "$base/*", GLOB_ONLYDIR ) as $dir ) {
			if ( $all || basename( $dir ) !== $was ) {
				foreach ( (array) glob( $dir . '/*' ) as $file ) {
					wp_delete_file( $file );
				}
				@rmdir( $dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- empty now, or another request is drawing into it.
			}
		}
	}

	/**
	 * A post saved: its cover, and any album with a track in it, may draw differently. Only a post
	 * with tracks, or one that had a cover kept, as every redraw gives every cover a new address.
	 *
	 * @since 5.7.0
	 *
	 * @param int     $post_id Post ID.
	 * @param WP_Post $post    Post.
	 */
	public static function saved( $post_id, $post ): void {
		if ( $post instanceof WP_Post && is_post_type_viewable( $post->post_type ) && ! wp_is_post_revision( $post ) && ! wp_is_post_autosave( $post ) && 'auto-draft' !== $post->post_status && self::holds( $post ) ) {
			self::redraw();
		}
	}

	/**
	 * Whether a post has a cover drawn, or tracks a cover draws: in it, attached to it, or kept.
	 *
	 * @param WP_Post $post Post.
	 * @return bool
	 */
	private static function holds( WP_Post $post ): bool {
		$file = self::file( (string) $post->ID );
		if ( $file && is_file( $file['path'] ) ) {
			return true;
		}
		$attached = get_children(
			array(
				'post_parent'    => $post->ID,
				'post_type'      => 'attachment',
				'post_mime_type' => 'audio',
				'numberposts'    => 1,
				'fields'         => 'ids',
			)
		);
		return $attached || Library::tracks( $post );
	}

	/**
	 * A track moved to another post, which may be one a visitor can't read.
	 *
	 * @since 5.7.0
	 *
	 * @param int     $post_id Attachment ID.
	 * @param WP_Post $after   The attachment now.
	 * @param WP_Post $before  The attachment before.
	 */
	public static function moved( $post_id, $after, $before ): void {
		if ( $after instanceof WP_Post && $before instanceof WP_Post && $after->post_parent !== $before->post_parent && wp_attachment_is( 'audio', $after ) ) {
			self::redraw( true );
		}
	}

	/**
	 * A track attached or detached in the Media Library, which changes its post without saving it.
	 *
	 * @since 5.7.0
	 *
	 * @param string $action        Attach or detach.
	 * @param int    $attachment_id Attachment ID.
	 */
	public static function attached( $action, $attachment_id ): void {
		if ( wp_attachment_is( 'audio', (int) $attachment_id ) ) {
			self::redraw( true );
		}
	}

	/**
	 * A track deleted.
	 *
	 * @since 5.7.0
	 *
	 * @param int $post_id Attachment ID.
	 */
	public static function removed( $post_id ): void {
		if ( wp_attachment_is( 'audio', (int) $post_id ) ) {
			self::redraw();
		}
	}

	/**
	 * A post that stops being public, or gains a password, takes every kept cover with it: its own,
	 * and an album's that counted its tracks.
	 *
	 * @since 5.7.0
	 *
	 * @param int     $post_id Post ID.
	 * @param WP_Post $after   The post now.
	 * @param WP_Post $before  The post before.
	 */
	public static function updated( $post_id, $after, $before ): void {
		if ( $before instanceof WP_Post && $after instanceof WP_Post && self::open( $before ) && ! self::open( $after ) ) {
			self::redraw( true );
		}
	}

	/**
	 * A public post deleted outright takes every kept cover with it.
	 *
	 * @since 5.7.0
	 *
	 * @param int $post_id Post ID.
	 */
	public static function deleting( $post_id ): void {
		$post = get_post( (int) $post_id );
		if ( $post instanceof WP_Post && self::open( $post ) ) {
			self::redraw( true );
		}
	}

	/**
	 * Whether anyone may see a post, and so its cover.
	 *
	 * @param WP_Post $post Post.
	 * @return bool
	 */
	private static function open( WP_Post $post ): bool {
		return is_post_publicly_viewable( $post ) && '' === $post->post_password;
	}

	/**
	 * A track filed under another album or artist.
	 *
	 * @since 5.7.0
	 *
	 * @param int    $object_id Object ID.
	 * @param array  $terms     Terms.
	 * @param array  $tt_ids    Term taxonomy IDs.
	 * @param string $taxonomy  Taxonomy.
	 */
	public static function filed( $object_id, $terms, $tt_ids, $taxonomy ): void {
		if ( in_array( $taxonomy, array( Catalog::ALBUM, Catalog::ARTIST ), true ) ) {
			self::redraw();
		}
	}

	/**
	 * A track's tags or levels, or an album's artist, changed.
	 *
	 * @since 5.7.0
	 *
	 * @param int|int[] $meta_id   Meta ID, or IDs.
	 * @param int       $object_id Object ID.
	 * @param string    $key       Meta key.
	 */
	public static function meta( $meta_id, $object_id, $key ): void {
		if ( Catalog::ALBUM_ARTIST === $key || ( '_wp_attachment_metadata' === $key && wp_attachment_is( 'audio', (int) $object_id ) ) ) {
			self::redraw();
		}
	}

	/**
	 * The generated cover as the artwork list the player reads.
	 *
	 * @since 4.0.0
	 * @param int $post_id Post ID.
	 * @return array List of { src, sizes }.
	 */
	public static function art( int $post_id ): array {
		if ( ! $post_id ) {
			return array();
		}
		return array(
			array(
				'src'   => self::url( $post_id ),
				'sizes' => '1024x1024',
				'type'  => 'image/svg+xml',
				'alt'   => self::alt( html_entity_decode( get_the_title( $post_id ), ENT_QUOTES, 'UTF-8' ), '' ),
			),
		);
	}

	/**
	 * Serves the cover and stops, before the main query runs. `?riff-art=sheet` serves the contact
	 * sheet to anyone who can edit posts.
	 *
	 * @since 4.0.0
	 * @param WP $wp The request.
	 */
	public static function serve( $wp ): void {
		if ( ! $wp instanceof WP || empty( $wp->query_vars[ self::QUERY ] ) ) {
			return;
		}
		if ( self::SHEET === $wp->query_vars[ self::QUERY ] ) {
			if ( ! current_user_can( 'edit_posts' ) ) {
				status_header( 403 );
				exit;
			}
			status_header( 200 );
			header( 'Content-Type: text/html; charset=utf-8' );
			header( 'Cache-Control: no-store' );
			echo self::sheet(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- an HTML document built here, every value escaped where it is placed.
			exit;
		}
		$drawn = (string) $wp->query_vars[ self::QUERY ];
		$cache = 'public, max-age=86400';
		$since = microtime( true );
		$svg   = self::shared( $drawn );
		if ( null !== $svg ) {
			self::keep( $drawn, $svg, $since );
		} elseif ( is_user_logged_in() ) {
			// A cover only this listener may see, of an album of private tracks, is drawn for them
			// and kept nowhere.
			$svg   = self::draw( $drawn );
			$cache = 'private, max-age=86400';
		}
		if ( null === $svg ) {
			status_header( 404 );
			exit;
		}
		$etag = '"' . md5( $svg ) . '"';
		if ( isset( $_SERVER['HTTP_IF_NONE_MATCH'] ) && trim( sanitize_text_field( wp_unslash( $_SERVER['HTTP_IF_NONE_MATCH'] ) ) ) === $etag ) {
			status_header( 304 );
			exit;
		}
		status_header( 200 );
		header( 'Content-Type: image/svg+xml; charset=utf-8' );
		header( 'Cache-Control: ' . $cache );
		header( 'ETag: ' . $etag );
		echo $svg; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- an SVG document, every text node escaped where it is built.
		exit;
	}

	/**
	 * A cover as the requester may see it: an album's from the tracks they may play, a post's when
	 * they may read it.
	 *
	 * @since 5.7.0
	 *
	 * @param string $drawn A post ID, or album-<term ID>.
	 * @return string|null SVG document, or null for nothing the requester may see.
	 */
	public static function draw( string $drawn ): ?string {
		if ( preg_match( '/^album-(\d+)$/', $drawn, $m ) ) {
			return self::album_svg( (int) $m[1] );
		}
		$post = get_post( absint( $drawn ) );
		return $post instanceof WP_Post && is_post_publicly_viewable( $post ) && ! post_password_required( $post ) ? self::svg( $post ) : null;
	}

	/**
	 * A cover as anyone may see it, signed in or not, which is the one kept in uploads.
	 *
	 * @since 5.7.0
	 *
	 * @param string $drawn A post ID, or album-<term ID>.
	 * @return string|null SVG document, or null for nothing everyone may see.
	 */
	public static function shared( string $drawn ): ?string {
		if ( ! preg_match( '/^album-\d+$/', $drawn ) ) {
			$post = get_post( absint( $drawn ) );
			if ( ! $post instanceof WP_Post || ! self::open( $post ) ) {
				return null;
			}
		}
		$user = get_current_user_id();
		wp_set_current_user( 0 );
		try {
			return self::draw( $drawn );
		} finally {
			wp_set_current_user( $user );
		}
	}

	/**
	 * Draws the cover for a post: the choices come from its slug, so a post keeps its cover on
	 * any site and through any reseed.
	 *
	 * @since 4.0.0
	 * @param WP_Post $post Post.
	 * @return string SVG document.
	 */
	public static function svg( WP_Post $post ): string {
		$item     = Library::item( $post );
		$tracks   = Library::tracks( $post );
		$seed     = crc32( (string) $post->post_name );
		$palettes = Cover::palettes();
		$layouts  = Cover::layouts();
		$svg      = Cover::draw(
			$item,
			$tracks,
			$palettes[ $seed % count( $palettes ) ],
			$layouts[ intdiv( $seed, count( $palettes ) ) % count( $layouts ) ]
		);
		return $svg;
	}

	/**
	 * The contact sheet: every palette and layout for one sample album, for design review.
	 *
	 * @since 4.3.0
	 *
	 * @return string HTML document.
	 */
	public static function sheet(): string {
		$posts  = Library::query( array( 'posts_per_page' => 1 ) )->posts;
		$post   = $posts ? $posts[0] : null;
		$item   = $post ? Library::item( $post ) : array(
			'title'    => 'Night Sessions',
			'artist'   => 'The Example Quartet',
			'count'    => 9,
			'duration' => 2460,
			'meta'     => '9 tracks · 41 min',
		);
		$tracks = $post ? Library::tracks( $post ) : array_map(
			static fn( $i ) => array( 'duration' => 180 + 37 * $i ),
			range( 1, 9 )
		);
		$cells  = '';
		foreach ( Cover::layouts() as $layout ) {
			foreach ( Cover::palettes() as $palette ) {
				$svg    = Cover::draw( $item, $tracks, $palette, $layout );
				$cells .= '<figure><img src="data:image/svg+xml;base64,' . base64_encode( $svg ) . '" alt="" width="256" height="256"><figcaption>' . esc_html( $layout . ' · ' . implode( ' ', array_slice( array_values( $palette ), 0, 2 ) ) ) . '</figcaption></figure>'; // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- an inline image.
			}
		}
		return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' . esc_html__( 'Riff covers', 'riff' ) . '</title>' .
			'<style>body{margin:0;padding:24px;background:#f6f6f6;color:#1e1e1e;font:14px/1.5 Inter,system-ui,sans-serif}' .
			'h1{font:400 32px/1.1 "EB Garamond",Georgia,serif;margin:0 0 16px}' .
			'.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(256px,1fr));gap:24px}' .
			'figure{margin:0}img{display:block;width:100%;height:auto;border-radius:2px}figcaption{margin-top:6px;color:#656a71;font-size:12px}</style></head>' .
			'<body><h1>' . esc_html__( 'Every cover Riff can draw', 'riff' ) . '</h1><div class="grid">' . $cells . '</div></body></html>';
	}

	/**
	 * Attachment meta caching an image's tint, worked out once from its pixels.
	 *
	 * @since 4.18.0
	 */
	public const TINT = '_riff_tint';

	/**
	 * The colour an album page tints its header with, from the cover the player shows: a drawn
	 * cover's own colour, or the most colourful shade of an uploaded image, read once and kept
	 * on the image. Empty when there is no cover, or the image cannot be read.
	 *
	 * @since 4.18.0
	 *
	 * @param array $art Artwork, as a track carries it, smallest first.
	 * @return string Hex colour, or empty.
	 */
	public static function tint( array $art ): string {
		$src = $art ? (string) ( end( $art )['src'] ?? '' ) : '';
		if ( '' === $src ) {
			return '';
		}
		$drawn = self::which( $src );
		if ( '' !== $drawn ) {
			// The slug the cover was drawn from: a post's, or an album term's.
			if ( preg_match( '/^album-(\d+)$/', $drawn, $m ) ) {
				$term = get_term( (int) $m[1], Catalog::ALBUM );
				$slug = $term instanceof WP_Term ? (string) $term->slug : null;
			} else {
				$post = is_numeric( $drawn ) ? get_post( (int) $drawn ) : null;
				$slug = $post instanceof WP_Post ? (string) $post->post_name : null;
			}
			if ( null === $slug ) {
				return '';
			}
			// A drawn cover's ground, unless it is the neutral charcoal or grey; then its accent.
			$palettes = Cover::palettes();
			$palette  = $palettes[ crc32( $slug ) % count( $palettes ) ];
			return isset( Cover::DISCS[ $palette[0] ] ) && '#3858e9' !== $palette[0] ? (string) $palette[1] : (string) $palette[0];
		}
		$id = attachment_url_to_postid( $src );
		if ( ! $id ) {
			return '';
		}
		$kept = (string) get_post_meta( $id, self::TINT, true );
		if ( '' !== $kept ) {
			return 'none' === $kept ? '' : $kept;
		}
		$tint = self::pixels( $id );
		update_post_meta( $id, self::TINT, '' !== $tint ? $tint : 'none' );
		return $tint;
	}

	/**
	 * The most colourful shade of an image: its pixels averaged, each weighted by how saturated
	 * it is, so a grey border does not wash a red cover out.
	 *
	 * @param int $id Image attachment ID.
	 * @return string Hex colour, or empty.
	 */
	private static function pixels( int $id ): string {
		if ( ! function_exists( 'imagecreatefromstring' ) ) {
			return '';
		}
		// The thumbnail where there is one: small, and already on disk.
		$file  = (string) get_attached_file( $id );
		$thumb = image_get_intermediate_size( $id, 'thumbnail' );
		if ( is_array( $thumb ) && ! empty( $thumb['path'] ) ) {
			$small = trailingslashit( wp_upload_dir( null, false )['basedir'] ) . $thumb['path'];
			$file  = is_readable( $small ) ? $small : $file;
		}
		$data  = is_readable( $file ) ? (string) file_get_contents( $file ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a local image.
		$image = '' !== $data ? @imagecreatefromstring( $data ) : false; // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- an unreadable image has no tint.
		if ( ! $image ) {
			return '';
		}
		$size = 16;
		$grid = imagecreatetruecolor( $size, $size );
		imagecopyresampled( $grid, $image, 0, 0, 0, 0, $size, $size, imagesx( $image ), imagesy( $image ) );
		$sum = array( 0.0, 0.0, 0.0 );
		$all = 0.0;
		for ( $x = 0; $x < $size; $x++ ) {
			for ( $y = 0; $y < $size; $y++ ) {
				$c      = imagecolorat( $grid, $x, $y );
				$rgb    = array( ( $c >> 16 ) & 255, ( $c >> 8 ) & 255, $c & 255 );
				$weight = ( max( $rgb ) - min( $rgb ) ) / 255 + 0.02;
				$weight = $weight * $weight;
				for ( $i = 0; $i < 3; $i++ ) {
					$sum[ $i ] += $rgb[ $i ] * $weight;
				}
				$all += $weight;
			}
		}
		return vsprintf( '#%02x%02x%02x', array_map( static fn( $v ) => (int) round( $v / $all ), $sum ) );
	}
}
