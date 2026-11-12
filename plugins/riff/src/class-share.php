<?php
/**
 * How a link to the site looks where it is shared: the Open Graph and link-card tags a messaging
 * app or a social site reads for its preview, and the large image they show.
 *
 * @package Riff
 */

namespace Riff;

use WP;
use WP_Post;
use WP_REST_Request;

defined( 'ABSPATH' ) || exit;

/**
 * The tags are printed for the site's own address and its Listen page, and only for what a
 * signed-out visitor may see: everything they say is worked out as one, and nothing is printed on a
 * private site. Where an SEO plugin prints its own tags, Riff prints none.
 *
 * The image is a card 1200 by 630, the size link previews show large: the site's name beside the
 * covers of its newest albums, or, where none has a cover of its own, beside a record. It is drawn
 * with GD and kept in uploads/riff-share, named by what is on it, so a new name or a new cover makes
 * a new file at a new address and a preview's cache takes the new one. Without GD, the image is the
 * largest cover there is, or the site's icon.
 *
 * The card's fonts are static cuts of the variable EB Garamond and Inter in assets/fonts, which GD
 * can't read: semibold Garamond and medium Inter, Latin and Latin Extended, made with fontTools
 * (`instancer` at wght 600 and 500 on each woff2, the two subsets merged, then `pyftsubset
 * --unicodes='*' --no-hinting --drop-tables+=GSUB,GPOS,STAT`).
 *
 * @since 6.16.0
 */
final class Share {

	/**
	 * The query variable that draws the card: `?riff-share=site`.
	 *
	 * @since 6.16.0
	 * @var string
	 */
	public const QUERY = 'riff-share';

	/**
	 * The folder in uploads the cards are kept in.
	 *
	 * @since 6.16.0
	 * @var string
	 */
	public const DIR = 'riff-share';

	/**
	 * The card's size: what link previews show as a large image.
	 *
	 * @since 6.16.0
	 * @var int
	 */
	public const WIDTH = 1200;

	/**
	 * The card's height.
	 *
	 * @since 6.16.0
	 * @var int
	 */
	public const HEIGHT = 630;

	/**
	 * How many covers the card shows.
	 *
	 * @var int
	 */
	private const COVERS = 4;

	/**
	 * The constants the common SEO plugins define, each of which prints its own Open Graph tags.
	 *
	 * @var string[]
	 */
	private const SEO_CONSTANTS = array( 'WPSEO_VERSION', 'RANK_MATH_VERSION', 'AIOSEO_VERSION', 'SEOPRESS_VERSION', 'THE_SEO_FRAMEWORK_VERSION', 'SLIM_SEO_VER' );

	/**
	 * The wp_head callbacks of plugins that print Open Graph tags as one feature among others.
	 *
	 * @var string[]
	 */
	private const SEO_HEADS = array( 'jetpack_og_tags' );

	/**
	 * Riff's palette, from the app icon (site/brand): the charcoal tile, the amber and the ivory.
	 *
	 * @var array<string, int[]>
	 */
	private const INK = array(
		'top'    => array( 0x2c, 0x2c, 0x30 ),
		'bottom' => array( 0x12, 0x12, 0x14 ),
		'amber'  => array( 0xff, 0xb0, 0x20 ),
		'ivory'  => array( 0xf2, 0xea, 0xdb ),
		'vinyl'  => array( 0x0b, 0x0b, 0x0c ),
		'groove' => array( 0x1a, 0x1a, 0x1d ),
	);

	/**
	 * Hooks in.
	 *
	 * @since 6.16.0
	 */
	public static function register(): void {
		add_filter( 'query_vars', array( self::class, 'query_vars' ) );
		// After Private_Site::gate(), which refuses a private site's visitors at 0.
		add_action( 'parse_request', array( self::class, 'serve' ) );
		add_action( 'wp_head', array( self::class, 'head' ), 5 );
		// A card says what the site is called and shows its covers, so it goes when the site turns private.
		add_action( 'add_option_' . Private_Site::OPTION, array( self::class, 'forget' ) );
		add_action( 'update_option_' . Private_Site::OPTION, array( self::class, 'forget' ) );
	}

	/**
	 * Adds the card's query variable.
	 *
	 * @since 6.16.0
	 *
	 * @param string[] $vars Query variables.
	 * @return string[]
	 */
	public static function query_vars( $vars ) {
		$vars   = is_array( $vars ) ? $vars : array();
		$vars[] = self::QUERY;
		return $vars;
	}

	/**
	 * Prints the tags.
	 *
	 * @since 6.16.0
	 */
	public static function head(): void {
		foreach ( self::tags() as $key => $value ) {
			$attribute = 'description' === $key || str_starts_with( (string) $key, 'twitter:' ) ? 'name' : 'property';
			printf( '<meta %1$s="%2$s" content="%3$s">' . "\n", $attribute, esc_attr( (string) $key ), esc_attr( (string) $value ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- name or property, chosen above.
		}
	}

	/**
	 * The tags for this request, keyed by property or name: none for a page Riff doesn't describe,
	 * for anything a signed-out visitor may not see, or where an SEO plugin prints its own.
	 *
	 * @since 6.16.0
	 *
	 * @return array<string, string>
	 */
	public static function tags(): array {
		$context = self::context();
		if ( ! $context ) {
			return array();
		}
		$tags = self::seo() ? array() : self::site_tags( $context );
		/**
		 * Filters the Open Graph and link-card tags Riff prints in the head of the site's own address
		 * and its Listen page, keyed by property (`og:title`) or, for `description` and the
		 * `twitter:` tags, by name. Empty prints none. It is empty already where an SEO plugin prints
		 * its own tags, and it runs only for what a signed-out visitor may see, never on a private site.
		 *
		 * A host that calls every site's previews by its own name sets `og:site_name` here.
		 *
		 * @since 6.16.0
		 *
		 * @param string[] $tags    The tags, keyed by property or name.
		 * @param array    $context `{ kind: 'site', page: int, url: string }`: the Listen page's ID, 0 for a theme's front page, and the page's address.
		 */
		$tags = apply_filters( 'riff_open_graph', $tags, $context );
		return is_array( $tags ) ? array_filter( array_map( 'strval', $tags ), static fn( $value ) => '' !== $value ) : array();
	}

	/**
	 * What the page is, for the tags, or null for one Riff says nothing of: the site's own address
	 * or the Listen page at Home, public, on a site that isn't private.
	 *
	 * @return array|null `{ kind, page, url }`.
	 */
	private static function context(): ?array {
		if ( Private_Site::on() || is_admin() || is_feed() || is_404() || is_paged() ) {
			return null;
		}
		$page = get_queried_object();
		if ( $page instanceof WP_Post && Listen\App::holds_app( $page ) ) {
			// A view in the app (a post, an album, a search) is named by what is in it: not yet.
			// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- whether a view is asked for; nothing changes.
			if ( isset( $_GET[ Listen\App::QUERY ] ) || Listen\Browse::requested() || ! self::open( $page ) ) {
				return null;
			}
			return array(
				'kind' => 'site',
				'page' => $page->ID,
				'url'  => Listen\Standalone::active() ? Listen\Standalone::url( $page->ID ) : (string) get_permalink( $page ),
			);
		}
		if ( is_front_page() ) {
			return array(
				'kind' => 'site',
				'page' => 0,
				'url'  => home_url( '/' ),
			);
		}
		return null;
	}

	/**
	 * Whether a signed-out visitor may read a post.
	 *
	 * @param WP_Post $post Post.
	 * @return bool
	 */
	private static function open( WP_Post $post ): bool {
		return '' === $post->post_password && is_post_publicly_viewable( $post );
	}

	/**
	 * Whether an SEO plugin prints Open Graph tags of its own, found by its constant or its hook.
	 *
	 * @since 6.16.0
	 *
	 * @return bool
	 */
	public static function seo(): bool {
		foreach ( self::SEO_CONSTANTS as $constant ) {
			if ( defined( $constant ) ) {
				return true;
			}
		}
		foreach ( self::SEO_HEADS as $callback ) {
			if ( false !== has_action( 'wp_head', $callback ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * The tags for the site's own address and its Listen page.
	 *
	 * @param array $context What the page is.
	 * @return array<string, string>
	 */
	private static function site_tags( array $context ): array {
		$name  = self::name();
		$line  = self::line();
		$image = self::image( $context );
		$tags  = array(
			'description'    => $line,
			'og:type'        => 'website',
			'og:site_name'   => $name,
			'og:title'       => $name,
			'og:description' => $line,
			'og:url'         => (string) $context['url'],
			'og:locale'      => str_replace( '-', '_', (string) get_locale() ),
		);
		if ( $image ) {
			$tags += array(
				'og:image'        => $image['url'],
				'og:image:width'  => (string) $image['width'],
				'og:image:height' => (string) $image['height'],
				'og:image:alt'    => $image['alt'],
				// A square icon shown large is a blur, so it is shown small.
				'twitter:card'    => (int) $image['width'] >= 600 ? 'summary_large_image' : 'summary',
			);
		} else {
			$tags['twitter:card'] = 'summary';
		}
		return $tags;
	}

	/**
	 * The site's name, as text.
	 *
	 * @return string
	 */
	private static function name(): string {
		return trim( wp_strip_all_tags( html_entity_decode( (string) get_bloginfo( 'name' ), ENT_QUOTES, 'UTF-8' ) ) );
	}

	/**
	 * A line about the site: its tagline, or else how many albums and songs a visitor will find.
	 *
	 * @return string
	 */
	private static function line(): string {
		$tagline = trim( wp_strip_all_tags( html_entity_decode( (string) get_bloginfo( 'description' ), ENT_QUOTES, 'UTF-8' ) ) );
		if ( '' !== $tagline ) {
			return $tagline;
		}
		$facts = self::facts();
		$parts = array();
		if ( $facts['albums'] ) {
			/* translators: %s: how many albums. */
			$parts[] = sprintf( _n( '%s album', '%s albums', $facts['albums'], 'riff' ), number_format_i18n( $facts['albums'] ) );
		}
		if ( $facts['songs'] ) {
			/* translators: %s: how many songs. */
			$parts[] = sprintf( _n( '%s song', '%s songs', $facts['songs'], 'riff' ), number_format_i18n( $facts['songs'] ) );
		}
		/* translators: the separator between "4 albums" and "52 songs". */
		return implode( _x( ' · ', 'between counts', 'riff' ), $parts );
	}

	/**
	 * What a signed-out visitor finds on the site: how many albums and songs, and the covers of the
	 * newest albums that have a picture of their own rather than one Riff drew. Read through the
	 * library's routes as that visitor, so a private album is never counted or shown, and kept until
	 * a post or a term next changes.
	 *
	 * @since 6.16.0
	 *
	 * @return array `{ albums: int, songs: int, covers: array[] }`, each cover `{ path, url, width,
	 *               height, name }`: a size to draw from, and the largest there is.
	 */
	public static function facts(): array {
		$kept = Cache::get( 'share_site' );
		if ( is_array( $kept ) ) {
			return $kept;
		}
		$user = get_current_user_id();
		wp_set_current_user( 0 );
		try {
			$albums = self::route( '/albums', array( 'orderby' => 'added' ) );
			$songs  = self::route( '/tracks', array( 'per_page' => 1 ) );
		} finally {
			wp_set_current_user( $user );
		}
		$covers = array();
		foreach ( (array) ( $albums['items'] ?? array() ) as $album ) {
			$cover = self::cover( (array) ( $album['art'] ?? array() ), (string) ( $album['name'] ?? '' ) );
			if ( $cover ) {
				$covers[] = $cover;
			}
			if ( count( $covers ) >= self::COVERS ) {
				break;
			}
		}
		$facts = array(
			'albums' => (int) ( $albums['total'] ?? 0 ),
			'songs'  => (int) ( $songs['total'] ?? 0 ),
			'covers' => $covers,
		);
		Cache::set( 'share_site', $facts );
		return $facts;
	}

	/**
	 * A GET request's data from the library's routes.
	 *
	 * @param string $route Route under riff/v1.
	 * @param array  $query Query arguments.
	 * @return array
	 */
	private static function route( string $route, array $query ): array {
		$request = new WP_REST_Request( 'GET', '/' . Library::REST . $route );
		$request->set_query_params( $query );
		$response = rest_do_request( $request );
		return $response->is_error() ? array() : (array) $response->get_data();
	}

	/**
	 * A cover to draw from, when an album's artwork is a picture in this site's uploads rather than
	 * one Riff drew.
	 *
	 * @param array  $art  The album's artwork, smallest first.
	 * @param string $name The album's name.
	 * @return array|null `{ path, url, width, height, name }`.
	 */
	private static function cover( array $art, string $name ): ?array {
		if ( ! $art || Listen\Art::drawn( $art ) ) {
			return null;
		}
		$art = array_values( array_filter( $art, static fn( $size ) => self::raster( (string) ( $size['src'] ?? '' ) ) ) );
		if ( ! $art ) {
			return null;
		}
		$largest = end( $art );
		// The smallest size the card's largest cover, 470 pixels, can be drawn from without blurring.
		$draw = $largest;
		foreach ( $art as $size ) {
			if ( (int) $size['sizes'] >= 470 ) {
				$draw = $size;
				break;
			}
		}
		$path = self::local( (string) $draw['src'] );
		if ( '' === $path ) {
			return null;
		}
		$wide = array_map( 'intval', explode( 'x', (string) $largest['sizes'] ) + array( 0, 0 ) );
		return array(
			'path'   => $path,
			'url'    => (string) $largest['src'],
			'width'  => $wide[0],
			'height' => $wide[1],
			'name'   => $name,
		);
	}

	/**
	 * Whether an address is a picture link previews can show: PNG, JPEG, GIF or WebP, and not a
	 * protected file's or a signed one.
	 *
	 * @param string $url The address.
	 * @return bool
	 */
	private static function raster( string $url ): bool {
		$query = (string) wp_parse_url( $url, PHP_URL_QUERY );
		if ( '' === $url || preg_match( '/(^|&)riff-(file|sig|expires)=/', $query ) ) {
			return false;
		}
		return (bool) preg_match( '/\.(png|jpe?g|gif|webp)$/i', (string) wp_parse_url( $url, PHP_URL_PATH ) );
	}

	/**
	 * The file in uploads an address is, or empty for one elsewhere.
	 *
	 * @param string $url The address.
	 * @return string
	 */
	private static function local( string $url ): string {
		$uploads = wp_upload_dir( null, false );
		if ( ! empty( $uploads['error'] ) || wp_is_stream( $uploads['basedir'] ) ) {
			return '';
		}
		$base = (string) preg_replace( '#^https?:#', '', trailingslashit( $uploads['baseurl'] ) );
		$url  = (string) preg_replace( '#^https?:#', '', strtok( $url, '?' ) );
		if ( ! str_starts_with( $url, $base ) ) {
			return '';
		}
		$path = trailingslashit( $uploads['basedir'] ) . rawurldecode( substr( $url, strlen( $base ) ) );
		return ! str_contains( $path, '..' ) && is_file( $path ) ? $path : '';
	}

	/**
	 * The image the tags name: the card, or without GD the largest cover or the site's icon; then
	 * as `riff_share_image` says, so long as it is still a picture link previews can show.
	 *
	 * @param array $context What the page is.
	 * @return array|null `{ url, width, height, alt }`.
	 */
	private static function image( array $context ): ?array {
		$card  = self::card_spec();
		$image = $card ? self::card_image( $card ) : self::fallback( self::facts() );
		/**
		 * Filters the image a link to the site's own address or its Listen page is previewed with:
		 * Riff's card, or where it can't draw one, the largest album cover or the site's icon. A
		 * picture link previews can show only, PNG, JPEG, GIF or WebP, and never a protected file's
		 * address: anything else is ignored, and Riff's own is used.
		 *
		 * @since 6.16.0
		 *
		 * @param array|null $image   `{ url, width, height, alt }`, or null for none.
		 * @param array      $context `{ kind: 'site', page: int, url: string }`, as `riff_open_graph` has it.
		 */
		$filtered = apply_filters( 'riff_share_image', $image, $context );
		if ( null === $filtered ) {
			return null;
		}
		if ( ! is_array( $filtered ) || ! self::raster( (string) ( $filtered['url'] ?? '' ) ) ) {
			return $image;
		}
		return array(
			'url'    => (string) $filtered['url'],
			'width'  => (int) ( $filtered['width'] ?? 0 ),
			'height' => (int) ( $filtered['height'] ?? 0 ),
			'alt'    => (string) ( $filtered['alt'] ?? '' ),
		);
	}

	/**
	 * The image to share without GD to draw the card: the largest album cover, or the site's icon,
	 * or Riff's own.
	 *
	 * @since 6.16.0
	 *
	 * @param array $facts What a visitor finds, from facts().
	 * @return array `{ url, width, height, alt }`.
	 */
	public static function fallback( array $facts ): array {
		$covers = (array) ( $facts['covers'] ?? array() );
		usort( $covers, static fn( $a, $b ) => (int) $b['width'] <=> (int) $a['width'] );
		if ( $covers ) {
			return array(
				'url'    => (string) $covers[0]['url'],
				'width'  => (int) $covers[0]['width'],
				'height' => (int) $covers[0]['height'],
				'alt'    => Listen\Art::alt( (string) $covers[0]['name'], '' ),
			);
		}
		$icon = get_site_icon_url( 512 );
		return array(
			'url'    => $icon ? $icon : RIFF_URL . 'features/listen/icons/icon-512.png',
			'width'  => 512,
			'height' => 512,
			'alt'    => self::name(),
		);
	}

	/**
	 * What the site's card shows, and the key it is kept under, or null where it can't be drawn:
	 * without GD's TrueType text, or for a name in a script the card's fonts don't have.
	 *
	 * @return array|null `{ key, title, line, covers }`.
	 */
	private static function card_spec(): ?array {
		$name = self::name();
		if ( ! function_exists( 'imagecreatetruecolor' ) || ! function_exists( 'imagettftext' ) || '' === $name || ! self::drawable( $name . self::line() ) ) {
			return null;
		}
		$covers      = array_map( static fn( $cover ) => array( (string) $cover['path'], (string) $cover['name'] ), self::facts()['covers'] );
		$spec        = array(
			'title'  => $name,
			'line'   => self::line(),
			'covers' => $covers,
		);
		$stamp       = array_map( static fn( $cover ) => $cover[0] . ':' . (int) @filemtime( $cover[0] ), $covers ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a cover deleted since is a new card.
		$spec['key'] = substr( md5( RIFF_VERSION . (string) md5_file( __FILE__ ) . wp_json_encode( array( $spec, $stamp ) ) ), 0, 12 );
		return $spec;
	}

	/**
	 * Whether the card's fonts have every letter of a text: Latin and Latin Extended.
	 *
	 * @param string $text The text.
	 * @return bool
	 */
	private static function drawable( string $text ): bool {
		return (bool) preg_match( '/^[\x{20}-\x{7E}\x{A0}-\x{24F}\x{1E00}-\x{1EFF}\x{2010}-\x{2027}\x{20AC}]*$/u', $text );
	}

	/**
	 * The card as the tags name it: the file in uploads once it has been drawn, which the web server
	 * serves without starting WordPress, and until then ?riff-share, which draws it and keeps it.
	 * Either way named by what is on it.
	 *
	 * @param array $spec From card_spec().
	 * @return array `{ url, width, height, alt }`.
	 */
	private static function card_image( array $spec ): array {
		$file  = self::file( $spec['key'] );
		$names = array_map( static fn( $cover ) => $cover[1], $spec['covers'] );
		return array(
			'url'    => $file && is_file( $file['path'] ) ? $file['url'] : add_query_arg(
				array(
					self::QUERY => 'site',
					'ver'       => $spec['key'],
				),
				home_url( '/' )
			),
			'width'  => self::WIDTH,
			'height' => self::HEIGHT,
			/* translators: 1: the site's name, 2: a list of albums. */
			'alt'    => $names ? sprintf( __( '%1$s, with the covers of %2$s', 'riff' ), $spec['title'], wp_sprintf_l( '%l', $names ) ) : $spec['title'],
		);
	}

	/**
	 * Where a card is kept, or null where none can be: without uploads, or with uploads somewhere a
	 * folder can't be listed, as on S3, where the cards before could not be found to delete.
	 *
	 * @param string $key The card's key.
	 * @return array|null `{ path, url }`.
	 */
	private static function file( string $key ): ?array {
		$uploads = wp_upload_dir( null, false );
		if ( Private_Site::on() || ! empty( $uploads['error'] ) || wp_is_stream( $uploads['basedir'] ) ) {
			return null;
		}
		$name = self::DIR . '/site-' . $key . '.png';
		return array(
			'path' => trailingslashit( $uploads['basedir'] ) . $name,
			'url'  => trailingslashit( $uploads['baseurl'] ) . $name,
		);
	}

	/**
	 * The site's card, drawn and kept if it isn't yet, or null where none can be drawn.
	 *
	 * @since 6.16.0
	 *
	 * @return array|null `{ png: string, path: string }`, path empty where the card can't be kept.
	 */
	public static function card(): ?array {
		$spec = Private_Site::on() ? null : self::card_spec();
		if ( ! $spec ) {
			return null;
		}
		$file = self::file( $spec['key'] );
		if ( $file && is_file( $file['path'] ) ) {
			return array(
				'png'  => (string) file_get_contents( $file['path'] ), // phpcs:ignore WordPressVIPMinimum.Performance.FetchingRemoteData.FileGetContentsUnknown, WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- the card kept in uploads.
				'path' => $file['path'],
			);
		}
		$png = self::draw( $spec );
		if ( null === $png ) {
			return null;
		}
		return array(
			'png'  => $png,
			'path' => $file ? self::keep( $file['path'], $png ) : '',
		);
	}

	/**
	 * Keeps a card, written whole and moved into place so the web server never serves half of one,
	 * and deletes the site's cards before it.
	 *
	 * @param string $path Where.
	 * @param string $png  The card.
	 * @return string The path, or empty where it couldn't be kept.
	 */
	private static function keep( string $path, string $png ): string {
		// isolation: write -- uploads/riff-share, where the cards are kept.
		if ( ! wp_mkdir_p( dirname( $path ) ) ) {
			return '';
		}
		$part = $path . '.' . wp_generate_password( 6, false ) . '.part';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents, WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- a card drawn here, written once and moved into place. isolation: write -- uploads/riff-share.
		if ( false === file_put_contents( $part, $png ) || ! @rename( $part, $path ) ) {
			wp_delete_file( $part );
			return '';
		}
		foreach ( (array) glob( dirname( $path ) . '/site-*.png' ) as $old ) {
			if ( $old !== $path ) {
				wp_delete_file( (string) $old );
			}
		}
		return $path;
	}

	/**
	 * Deletes every card kept, as the site turns private.
	 *
	 * @since 6.16.0
	 */
	public static function forget(): void {
		$uploads = wp_upload_dir( null, false );
		if ( ! empty( $uploads['error'] ) || wp_is_stream( $uploads['basedir'] ) ) {
			return;
		}
		foreach ( (array) glob( trailingslashit( $uploads['basedir'] ) . self::DIR . '/*.png' ) as $old ) {
			wp_delete_file( (string) $old );
		}
	}

	/**
	 * Answers ?riff-share=site with the card, and stops, before the main query runs. A private
	 * site has already refused a visitor by now, and has no card for anyone else.
	 *
	 * @since 6.16.0
	 *
	 * @param WP $wp The request.
	 */
	public static function serve( $wp ): void {
		if ( ! $wp instanceof WP || empty( $wp->query_vars[ self::QUERY ] ) ) {
			return;
		}
		$card = 'site' === $wp->query_vars[ self::QUERY ] ? self::card() : null;
		if ( ! $card ) {
			status_header( 404 );
			nocache_headers();
			exit;
		}
		status_header( 200 );
		header( 'Content-Type: image/png' );
		header( 'Content-Length: ' . strlen( $card['png'] ) );
		header( 'Cache-Control: public, max-age=86400' );
		echo $card['png']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- a PNG drawn here.
		exit;
	}

	/**
	 * Draws a card, at twice its size and then scaled down, so its circles and letters are smooth.
	 *
	 * @param array $spec From card_spec().
	 * @return string|null The PNG, or null where GD fails.
	 */
	private static function draw( array $spec ): ?string {
		$s   = 2;
		$w   = self::WIDTH * $s;
		$h   = self::HEIGHT * $s;
		$big = imagecreatetruecolor( $w, $h );
		if ( ! $big ) {
			return null;
		}
		imagealphablending( $big, true );
		$color = static fn( array $rgb, int $alpha = 0 ) => (int) imagecolorallocatealpha( $big, $rgb[0], $rgb[1], $rgb[2], $alpha );
		// The app icon's tile: charcoal, darker towards the foot.
		for ( $y = 0; $y < $h; $y++ ) {
			$t   = $y / ( $h - 1 );
			$mix = array_map( static fn( $a, $b ) => (int) round( $a + ( $b - $a ) * $t ), self::INK['top'], self::INK['bottom'] );
			imageline( $big, 0, $y, $w - 1, $y, $color( $mix ) );
		}

		$images = array();
		foreach ( $spec['covers'] as $cover ) {
			$image = self::load( $cover[0] );
			if ( $image ) {
				$images[] = $image;
			}
		}
		$pad  = 72 * $s;
		$text = self::art( $big, $images, $s, $color );

		$serif = RIFF_DIR . 'assets/fonts/eb-garamond/eb-garamond-semibold.ttf';
		$sans  = RIFF_DIR . 'assets/fonts/inter/inter-medium.ttf';
		$width = $text - $pad - 40 * $s;
		$title = self::fit( $spec['title'], $serif, $width, 104 * $s, 56 * $s );
		$line  = '' !== $spec['line'] ? self::wrap( $spec['line'], $sans, 30 * $s, $width, 2 ) : array();
		$rule  = 6 * $s;
		$gap   = 40 * $s;
		$lead  = (int) round( $title['size'] * 1.08 );
		$block = $rule + $gap + $lead * count( $title['lines'] ) + ( $line ? 28 * $s + 42 * $s * count( $line ) : 0 );
		$y     = (int) round( ( $h - $block ) / 2 );
		// An amber rule over the name, as the brand's accent.
		imagefilledrectangle( $big, $pad, $y, $pad + 64 * $s, $y + $rule, $color( self::INK['amber'] ) );
		$y += $rule + $gap;
		foreach ( $title['lines'] as $text_line ) {
			$y += $lead;
			imagettftext( $big, $title['size'] * 0.75, 0, $pad, $y - (int) round( $lead * 0.22 ), $color( self::INK['ivory'] ), $serif, $text_line );
		}
		if ( $line ) {
			$y += 28 * $s;
			foreach ( $line as $text_line ) {
				$y += 42 * $s;
				imagettftext( $big, 30 * $s * 0.75, 0, $pad, $y - 8 * $s, $color( self::INK['amber'] ), $sans, $text_line );
			}
		}

		$card = imagecreatetruecolor( self::WIDTH, self::HEIGHT );
		imagecopyresampled( $card, $big, 0, 0, 0, 0, self::WIDTH, self::HEIGHT, $w, $h );
		ob_start();
		imagepng( $card, null, 9 );
		$png = (string) ob_get_clean();
		return '' !== $png ? $png : null;
	}

	/**
	 * Draws the right of the card: the covers, or a record where there are none.
	 *
	 * @param \GdImage   $big    The card at twice its size.
	 * @param \GdImage[] $images The covers.
	 * @param int        $s      The scale.
	 * @param callable   $color  Allocates a colour.
	 * @return int Where the art begins, from the left, which the text keeps clear of.
	 */
	private static function art( $big, array $images, int $s, callable $color ): int {
		$w     = self::WIDTH * $s;
		$h     = self::HEIGHT * $s;
		$right = $w - 72 * $s;
		$count = count( $images );
		if ( $count >= 4 ) {
			// A two by two grid, as an album list shows them.
			$cell = 246 * $s;
			$gap  = 12 * $s;
			$side = $cell * 2 + $gap;
			$x    = $right - $side;
			$top  = (int) ( ( $h - $side ) / 2 );
			foreach ( array_slice( $images, 0, 4 ) as $i => $image ) {
				self::place( $big, $image, $x + ( $i % 2 ) * ( $cell + $gap ), $top + intdiv( $i, 2 ) * ( $cell + $gap ), $cell, $s, $color );
			}
			return $x;
		}
		if ( $count >= 2 ) {
			// Fanned out, the newest in front, as they stand in a crate.
			$side  = 400 * $s;
			$step  = 64 * $s;
			$x     = $right - $side - $step * ( $count - 1 );
			$top   = (int) ( ( $h - $side ) / 2 );
			$order = array_reverse( $images, true );
			foreach ( $order as $i => $image ) {
				self::place( $big, $image, $x + $step * ( $count - 1 - $i ), $top, $side, $s, $color, 36 * $i );
			}
			return $x;
		}
		if ( 1 === $count ) {
			// A record half out of its sleeve.
			$side = 440 * $s;
			$peek = 150 * $s;
			$x    = $right - $side - $peek;
			$top  = (int) ( ( $h - $side ) / 2 );
			self::record( $big, $x + $peek + (int) ( $side / 2 ), (int) ( $h / 2 ), (int) ( $side * 0.48 ), $color );
			self::place( $big, $images[0], $x, $top, $side, $s, $color );
			return $x;
		}
		// No cover: a record, large, running off the right edge.
		$radius = 400 * $s;
		self::record( $big, $w - 150 * $s, (int) ( $h / 2 ), $radius, $color );
		return $w - 150 * $s - $radius;
	}

	/**
	 * Draws a cover, cut square from the middle, over a soft shadow; one further back is dimmed.
	 *
	 * @param \GdImage $big   The card.
	 * @param \GdImage $image The cover.
	 * @param int      $x     Left.
	 * @param int      $y     Top.
	 * @param int      $side  Size.
	 * @param int      $s     The scale.
	 * @param callable $color Allocates a colour.
	 * @param int      $dim   How much darker, 0 to 127.
	 */
	private static function place( $big, $image, int $x, int $y, int $side, int $s, callable $color, int $dim = 0 ): void {
		for ( $i = 12; $i > 0; $i-- ) {
			$grow = $i * 2 * $s;
			imagefilledrectangle( $big, $x - $grow + 6 * $s, $y - $grow + 14 * $s, $x + $side + $grow - 6 * $s, $y + $side + $grow + 14 * $s, $color( array( 0, 0, 0 ), 122 ) );
		}
		$iw  = imagesx( $image );
		$ih  = imagesy( $image );
		$cut = min( $iw, $ih );
		imagecopyresampled( $big, $image, $x, $y, (int) ( ( $iw - $cut ) / 2 ), (int) ( ( $ih - $cut ) / 2 ), $side, $side, $cut, $cut );
		if ( $dim ) {
			imagefilledrectangle( $big, $x, $y, $x + $side - 1, $y + $side - 1, $color( array( 0, 0, 0 ), max( 0, 127 - $dim ) ) );
		}
	}

	/**
	 * Draws a record: black vinyl, its grooves, and an amber label round the spindle.
	 *
	 * @param \GdImage $big    The card.
	 * @param int      $cx     Centre, across.
	 * @param int      $cy     Centre, down.
	 * @param int      $radius Radius.
	 * @param callable $color  Allocates a colour.
	 */
	private static function record( $big, int $cx, int $cy, int $radius, callable $color ): void {
		imagefilledellipse( $big, $cx, $cy, $radius * 2, $radius * 2, $color( self::INK['vinyl'] ) );
		imagesetthickness( $big, 2 );
		$groove = $color( self::INK['groove'] );
		for ( $r = (int) ( $radius * 0.95 ); $r > $radius * 0.38; $r -= 9 ) {
			imageellipse( $big, $cx, $cy, $r * 2, $r * 2, $groove );
		}
		imagesetthickness( $big, 1 );
		$label = (int) ( $radius * 0.33 );
		imagefilledellipse( $big, $cx, $cy, $label * 2, $label * 2, $color( self::INK['amber'] ) );
		imagefilledellipse( $big, $cx, $cy, (int) ( $label * 1.5 ), (int) ( $label * 1.5 ), $color( array( 0xe8, 0x8f, 0x00 ), 90 ) );
		imagefilledellipse( $big, $cx, $cy, (int) ( $radius * 0.05 ), (int) ( $radius * 0.05 ), $color( self::INK['bottom'] ) );
	}

	/**
	 * A cover's picture, or null where GD can't read it.
	 *
	 * @param string $path The file.
	 * @return \GdImage|null
	 */
	private static function load( string $path ) {
		$data  = is_file( $path ) ? file_get_contents( $path ) : false; // phpcs:ignore WordPressVIPMinimum.Performance.FetchingRemoteData.FileGetContentsUnknown, WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a cover in uploads.
		$image = false !== $data ? @imagecreatefromstring( $data ) : false; // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a file GD can't read is left out.
		return $image ? $image : null;
	}

	/**
	 * The name at the largest size that fits in two lines at most, and the lines it takes; at the
	 * smallest, a third line's words are cut with an ellipsis.
	 *
	 * @param string $text  The name.
	 * @param string $font  The font file.
	 * @param int    $width The width there is.
	 * @param int    $most  The largest size, in pixels.
	 * @param int    $least The smallest size.
	 * @return array `{ size: int, lines: string[] }`.
	 */
	private static function fit( string $text, string $font, int $width, int $most, int $least ): array {
		for ( $size = $most; $size > $least; $size -= 4 ) {
			$lines = self::wrap( $text, $font, $size, $width, 0 );
			if ( count( $lines ) <= 2 && max( array_map( static fn( $l ) => self::measure( $l, $font, $size ), $lines ) ) <= $width ) {
				return array(
					'size'  => $size,
					'lines' => $lines,
				);
			}
		}
		return array(
			'size'  => $least,
			'lines' => self::wrap( $text, $font, $least, $width, 2 ),
		);
	}

	/**
	 * A text in lines that fit a width, at most $most of them (0 for any), the last cut with an
	 * ellipsis where it runs over.
	 *
	 * @param string $text  The text.
	 * @param string $font  The font file.
	 * @param int    $size  The size, in pixels.
	 * @param int    $width The width there is.
	 * @param int    $most  The most lines, or 0.
	 * @return string[]
	 */
	private static function wrap( string $text, string $font, int $size, int $width, int $most ): array {
		$lines = array();
		$now   = '';
		foreach ( preg_split( '/\s+/u', trim( $text ) ) as $word ) {
			$try = '' === $now ? $word : $now . ' ' . $word;
			if ( '' !== $now && self::measure( $try, $font, $size ) > $width ) {
				$lines[] = $now;
				$now     = $word;
			} else {
				$now = $try;
			}
		}
		$lines[] = $now;
		if ( $most && count( $lines ) > $most ) {
			$lines = array_slice( $lines, 0, $most - 1 ) + array( $most - 1 => implode( ' ', array_slice( $lines, $most - 1 ) ) );
		}
		$last = count( $lines ) - 1;
		while ( $most && mb_strlen( $lines[ $last ] ) > 1 && self::measure( $lines[ $last ], $font, $size ) > $width ) {
			$lines[ $last ] = rtrim( mb_substr( rtrim( $lines[ $last ], '…' ), 0, -1 ) ) . '…';
		}
		return $lines;
	}

	/**
	 * How wide a text is drawn, in pixels.
	 *
	 * @param string $text The text.
	 * @param string $font The font file.
	 * @param int    $size The size, in pixels.
	 * @return int
	 */
	private static function measure( string $text, string $font, int $size ): int {
		$box = imagettfbbox( $size * 0.75, 0, $font, $text );
		return $box ? (int) ( $box[2] - $box[0] ) : 0;
	}
}
